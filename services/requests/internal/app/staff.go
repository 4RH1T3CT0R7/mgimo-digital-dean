package app

import (
	"context"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/platform"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/requests/internal/api"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/requests/internal/db"
)

// Кабинет сотрудника: staff видит только свой факультет (чужое → 404), admin — всё.

func (s *Server) GetStaffStats(ctx context.Context, _ api.GetStaffStatsRequestObject) (api.GetStaffStatsResponseObject, error) {
	me, err := platform.RequireStaffOrAdmin(ctx)
	if err != nil {
		return nil, err
	}
	now := s.now()
	y, m, d := now.In(msk).Date()
	r, err := s.q.StaffStats(ctx, db.StaffStatsParams{Now: &now, DayStart: time.Date(y, m, d, 0, 0, 0, 0, msk), FacultyID: me.FacultyScope()})
	if err != nil {
		return nil, err
	}
	return api.GetStaffStats200JSONResponse{Submitted: int(r.Submitted), InProgress: int(r.InProgress),
		NeedsInfo: int(r.NeedsInfo), Overdue: int(r.Overdue), ReadyToday: int(r.ReadyToday),
		FeedbackTotal: int(r.FeedbackTotal), FeedbackHelpful: int(r.FeedbackHelpful)}, nil
}

var likeEscaper = strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)

func (s *Server) ListStaffApplications(ctx context.Context, req api.ListStaffApplicationsRequestObject) (api.ListStaffApplicationsResponseObject, error) {
	me, err := platform.RequireStaffOrAdmin(ctx)
	if err != nil {
		return nil, err
	}
	p := req.Params
	lim, off, err := page(p.Limit, p.Offset)
	if err != nil {
		return nil, err
	}
	scope := me.FacultyScope()
	if me.Role == platform.RoleAdmin && p.FacultyId != nil { // у staff фильтр игнорируется
		scope = p.FacultyId
	}
	var q *string
	if v := optionalText(p.Q); v != nil {
		if utf8.RuneCountInString(*v) > maxQueryLen {
			return nil, platform.Validation(map[string]string{"q": "Не больше 100 символов"})
		}
		e := likeEscaper.Replace(*v)
		q = &e
	}
	statuses := statusStrings(p.Status)
	now := s.now()
	rows, err := s.q.ListStaffApplications(ctx, db.ListStaffApplicationsParams{FacultyID: scope, Statuses: statuses,
		ServiceTypeID: p.ServiceTypeId, Q: q, Now: &now, Lim: lim, Off: off})
	if err != nil {
		return nil, err
	}
	total, err := s.q.CountStaffApplications(ctx, db.CountStaffApplicationsParams{FacultyID: scope,
		Statuses: statuses, ServiceTypeID: p.ServiceTypeId, Q: q})
	if err != nil {
		return nil, err
	}
	types, err := s.serviceTypes(ctx)
	if err != nil {
		return nil, err
	}
	out := api.ListStaffApplications200JSONResponse{Items: make([]api.StaffApplicationSummary, 0, len(rows)), Total: int(total)}
	for _, a := range rows {
		student, err := studentView(a)
		if err != nil {
			return nil, err
		}
		sum := summary(a, types[a.ServiceTypeID], now)
		out.Items = append(out.Items, api.StaffApplicationSummary{
			Id: sum.Id, Number: sum.Number, ServiceType: sum.ServiceType, Status: sum.Status,
			CreatedAt: sum.CreatedAt, UpdatedAt: sum.UpdatedAt, DueAt: sum.DueAt, Overdue: sum.Overdue,
			LastMessageAt: sum.LastMessageAt, LastMessageFrom: (*api.StaffApplicationSummaryLastMessageFrom)(sum.LastMessageFrom),
			Student: student,
		})
	}
	return out, nil
}

func (s *Server) GetStaffApplication(ctx context.Context, req api.GetStaffApplicationRequestObject) (api.GetStaffApplicationResponseObject, error) {
	_, a, err := s.scoped(ctx, req.ApplicationId)
	if err != nil {
		return nil, err
	}
	v, err := s.staffView(ctx, a)
	if err != nil {
		return nil, err
	}
	return api.GetStaffApplication200JSONResponse(v), nil
}

func (s *Server) ChangeApplicationStatus(ctx context.Context, req api.ChangeApplicationStatusRequestObject) (api.ChangeApplicationStatusResponseObject, error) {
	me, a, err := s.scoped(ctx, req.ApplicationId)
	if err != nil {
		return nil, err
	}
	if req.Body == nil {
		return nil, platform.Validation(nil)
	}
	to := req.Body.Status
	if !canTransition(api.ApplicationStatus(a.Status), to, actorStaff) {
		return nil, invalidTransition()
	}
	comment := optionalText(req.Body.Comment)
	switch {
	case comment == nil && commentRequired(to):
		return nil, platform.Validation(map[string]string{"comment": "Напишите комментарий для студента"})
	case comment != nil && utf8.RuneCountInString(*comment) > maxCommentLen:
		return nil, platform.Validation(map[string]string{"comment": "Не больше 2000 символов"})
	}
	st, err := s.q.GetServiceType(ctx, a.ServiceTypeID)
	if err != nil {
		return nil, err
	}
	if err := s.tx(ctx, func(q *db.Queries) error {
		return setStatus(ctx, q, a, to, actorStaff, &me.UserID, comment, s.now())
	}); err != nil {
		return nil, err
	}
	s.statusChanged(ctx, a, st, &a.Status, to, comment)
	if _, a, err = s.scoped(ctx, a.ID); err != nil {
		return nil, err
	}
	v, err := s.staffView(ctx, a)
	if err != nil {
		return nil, err
	}
	return api.ChangeApplicationStatus200JSONResponse(v), nil
}

// PostStaffMessage — ответ студенту. Подпись — «Деканат {факультет}» или «Администрация», без имени сотрудника (Б9, D37).
func (s *Server) PostStaffMessage(ctx context.Context, req api.PostStaffMessageRequestObject) (api.PostStaffMessageResponseObject, error) {
	me, a, err := s.scoped(ctx, req.ApplicationId)
	if err != nil {
		return nil, err
	}
	text, err := messageText(req.Body)
	if err != nil {
		return nil, err
	}
	if closedForMessages(a.Status) {
		return nil, invalidTransition()
	}
	st, err := s.q.GetServiceType(ctx, a.ServiceTypeID)
	if err != nil {
		return nil, err
	}
	label := "Администрация"
	if me.Role == platform.RoleStaff {
		snap, err := parseSnapshot(a) // заявка своего факультета: факультет студента = факультет сотрудника
		if err != nil {
			return nil, err
		}
		label = "Деканат " + snap.FacultyShort
	}
	m, err := s.addMessage(ctx, a, string(api.MessageAuthorRoleStaff), me.UserID, label, text, nil)
	if err != nil {
		return nil, err
	}
	s.messageAdded(ctx, a, st, m)
	return api.PostStaffMessage201JSONResponse(toMessage(m)), nil
}

func (s *Server) UploadStaffAttachment(ctx context.Context, req api.UploadStaffAttachmentRequestObject) (api.UploadStaffAttachmentResponseObject, error) {
	me, a, err := s.scoped(ctx, req.ApplicationId)
	if err != nil {
		return nil, err
	}
	if closedForMessages(a.Status) {
		return nil, invalidTransition()
	}
	att, err := s.saveUpload(ctx, a, req.Body, string(api.AttachmentUploadedByRoleStaff), me.UserID, true, nil)
	if err != nil {
		return nil, err
	}
	return api.UploadStaffAttachment201JSONResponse(att), nil
}

func (s *Server) DownloadStaffAttachment(ctx context.Context, req api.DownloadStaffAttachmentRequestObject) (api.DownloadStaffAttachmentResponseObject, error) {
	_, a, err := s.scoped(ctx, req.ApplicationId)
	if err != nil {
		return nil, err
	}
	f, err := s.q.GetAttachment(ctx, db.GetAttachmentParams{ID: req.AttachmentId, ApplicationID: a.ID})
	if err != nil {
		return nil, notFound(err)
	}
	return api.DownloadStaffAttachment200ApplicationoctetStreamResponse{FileContentApplicationoctetStreamResponse: fileContent(f)}, nil
}

// staffView — заявка для сотрудника: всё, что видит студент, плюс слепок и доступные переходы.
func (s *Server) staffView(ctx context.Context, a db.Application) (api.StaffApplication, error) {
	st, err := s.q.GetServiceType(ctx, a.ServiceTypeID)
	if err != nil {
		return api.StaffApplication{}, err
	}
	v, err := s.details(ctx, a, st)
	if err != nil {
		return api.StaffApplication{}, err
	}
	student, err := studentView(a)
	if err != nil {
		return api.StaffApplication{}, err
	}
	return api.StaffApplication{
		Id: v.Id, Number: v.Number, ServiceType: v.ServiceType, Status: v.Status,
		CreatedAt: v.CreatedAt, UpdatedAt: v.UpdatedAt, DueAt: v.DueAt, Overdue: v.Overdue,
		LastMessageAt: v.LastMessageAt, LastMessageFrom: (*api.StaffApplicationLastMessageFrom)(v.LastMessageFrom),
		Comment: v.Comment, Fields: v.Fields, StatusHistory: v.StatusHistory, Messages: v.Messages,
		Attachments: v.Attachments, Certificate: v.Certificate, Feedback: v.Feedback,
		Student: student, AllowedTransitions: allowedTransitions(v.Status, actorStaff),
	}, nil
}
