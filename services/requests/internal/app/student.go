package app

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"math"
	"regexp"
	"strings"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/platform"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/requests/internal/api"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/requests/internal/certificate"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/requests/internal/db"
)

// ---------- Каталог ----------

func (s *Server) ListServiceTypes(ctx context.Context, _ api.ListServiceTypesRequestObject) (api.ListServiceTypesResponseObject, error) {
	if _, err := platform.RequireAuth(ctx); err != nil {
		return nil, err
	}
	rows, err := s.q.ListActiveServiceTypes(ctx)
	if err != nil {
		return nil, err
	}
	out := make(api.ListServiceTypes200JSONResponse, 0, len(rows))
	for _, r := range rows {
		st, err := toServiceType(r)
		if err != nil {
			return nil, err
		}
		out = append(out, st)
	}
	return out, nil
}

// ---------- Заявки студента ----------

func (s *Server) ListMyApplications(ctx context.Context, req api.ListMyApplicationsRequestObject) (api.ListMyApplicationsResponseObject, error) {
	me, err := platform.RequireStudent(ctx)
	if err != nil {
		return nil, err
	}
	lim, off, err := page(req.Params.Limit, req.Params.Offset)
	if err != nil {
		return nil, err
	}
	statuses := statusStrings(req.Params.Status)
	rows, err := s.q.ListStudentApplications(ctx, db.ListStudentApplicationsParams{StudentID: me.UserID,
		Statuses: statuses, Answered: req.Params.Answered, Lim: lim, Off: off})
	if err != nil {
		return nil, err
	}
	total, err := s.q.CountStudentApplications(ctx, db.CountStudentApplicationsParams{StudentID: me.UserID,
		Statuses: statuses, Answered: req.Params.Answered})
	if err != nil {
		return nil, err
	}
	types, err := s.serviceTypes(ctx)
	if err != nil {
		return nil, err
	}
	now := s.now()
	out := api.ListMyApplications200JSONResponse{Items: make([]api.ApplicationSummary, 0, len(rows)), Total: int(total)}
	for _, a := range rows {
		out.Items = append(out.Items, summary(a, types[a.ServiceTypeID], now))
	}
	return out, nil
}

func (s *Server) CreateApplication(ctx context.Context, req api.CreateApplicationRequestObject) (api.CreateApplicationResponseObject, error) {
	me, err := platform.RequireStudent(ctx)
	if err != nil {
		return nil, err
	}
	if req.Body == nil {
		return nil, platform.Validation(nil)
	}
	st, err := s.q.GetServiceType(ctx, req.Body.ServiceTypeId)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && !st.Active) {
		return nil, platform.Validation(map[string]string{"service_type_id": "Такой услуги нет"})
	}
	if err != nil {
		return nil, err
	}
	defs, err := formFields(st)
	if err != nil {
		return nil, err
	}
	values, errs := validateFields(defs, req.Body.Fields)
	comment := optionalText(req.Body.Comment)
	if comment != nil && utf8.RuneCountInString(*comment) > maxCommentLen {
		errs["comment"] = "Не больше 2000 символов"
	}
	if len(errs) > 0 {
		return nil, platform.Validation(errs)
	}

	// Слепок студента — один раз при подаче (D32); факультет заявки — из него.
	card, err := s.studentCard(ctx, me.UserID)
	if err != nil {
		return nil, err
	}
	snap := snapshotFromCard(card)
	snapJSON, err := json.Marshal(snap)
	if err != nil {
		return nil, err
	}
	fieldsJSON, err := json.Marshal(values)
	if err != nil {
		return nil, err
	}

	now := s.now()
	instant := st.Kind == string(api.InstantCertificate)
	status, by, actorID := api.Submitted, actorStudent, &me.UserID
	dueAt := now.In(msk).AddDate(0, 0, int(st.SlaDays)) // Б5: created_at + sla_days календарных дней
	due := &dueAt
	if instant { // Б5: — → ready, справка в той же транзакции
		status, by, actorID, due = api.Ready, actorSystem, nil, nil
	}
	var a db.Application
	err = s.tx(ctx, func(q *db.Queries) error {
		a, err = q.CreateApplication(ctx, db.CreateApplicationParams{ID: uuid.New(), StudentID: me.UserID,
			FacultyID: card.FacultyId, ServiceTypeID: st.ID, Status: string(status), Fields: fieldsJSON,
			Comment: comment, StudentSnapshot: snapJSON, Now: now, DueAt: due})
		if err != nil {
			return err
		}
		if err := q.InsertStatusHistory(ctx, db.InsertStatusHistoryParams{ApplicationID: a.ID,
			Status: string(status), ActorRole: string(by), ActorID: actorID, Now: now}); err != nil {
			return err
		}
		if !instant {
			return nil
		}
		return q.CreateCertificate(ctx, db.CreateCertificateParams{
			Code:          rand.Text()[:10], // base32 A–Z2–7 из crypto/rand (Б6)
			ApplicationID: a.ID, Title: st.Title, Holder: snap.ShortName, FacultyShort: snap.FacultyShort,
			IssuedAt:   now,
			ValidUntil: pgtype.Date{Time: dateMSK(now).AddDate(0, 0, certValidDays), Valid: true},
		})
	})
	if err != nil {
		return nil, err
	}
	s.statusChanged(ctx, a, st, nil, status, nil)
	view, err := s.details(ctx, a, st)
	if err != nil {
		return nil, err
	}
	return api.CreateApplication201JSONResponse(view), nil
}

func (s *Server) GetMyApplication(ctx context.Context, req api.GetMyApplicationRequestObject) (api.GetMyApplicationResponseObject, error) {
	_, a, err := s.mine(ctx, req.ApplicationId)
	if err != nil {
		return nil, err
	}
	st, err := s.q.GetServiceType(ctx, a.ServiceTypeID)
	if err != nil {
		return nil, err
	}
	view, err := s.details(ctx, a, st)
	if err != nil {
		return nil, err
	}
	return api.GetMyApplication200JSONResponse(view), nil
}

func (s *Server) CancelMyApplication(ctx context.Context, req api.CancelMyApplicationRequestObject) (api.CancelMyApplicationResponseObject, error) {
	me, a, err := s.mine(ctx, req.ApplicationId)
	if err != nil {
		return nil, err
	}
	st, err := s.q.GetServiceType(ctx, a.ServiceTypeID)
	if err != nil {
		return nil, err
	}
	if err := s.tx(ctx, func(q *db.Queries) error {
		return setStatus(ctx, q, a, api.Cancelled, actorStudent, &me.UserID, nil, s.now())
	}); err != nil {
		return nil, err
	}
	s.statusChanged(ctx, a, st, &a.Status, api.Cancelled, nil)
	if a, err = s.q.GetStudentApplication(ctx, db.GetStudentApplicationParams{ID: a.ID, StudentID: me.UserID}); err != nil {
		return nil, err
	}
	view, err := s.details(ctx, a, st)
	if err != nil {
		return nil, err
	}
	return api.CancelMyApplication200JSONResponse(view), nil
}

const maxFeedbackLen = 1000

// PutMyFeedback — «помог ли ответ деканата». Только завершённая заявка, которую обрабатывал деканат.
func (s *Server) PutMyFeedback(ctx context.Context, req api.PutMyFeedbackRequestObject) (api.PutMyFeedbackResponseObject, error) {
	me, a, err := s.mine(ctx, req.ApplicationId)
	if err != nil {
		return nil, err
	}
	if req.Body == nil {
		return nil, platform.Validation(map[string]string{"helpful": "Обязательное поле"})
	}
	comment := optionalText(req.Body.Comment)
	if comment != nil && utf8.RuneCountInString(*comment) > maxFeedbackLen {
		return nil, platform.Validation(map[string]string{"comment": "Не больше 1000 символов"})
	}
	st, err := s.q.GetServiceType(ctx, a.ServiceTypeID)
	if err != nil {
		return nil, err
	}
	if st.Kind == string(api.InstantCertificate) {
		return nil, invalidTransition()
	}
	helpful, now := req.Body.Helpful, s.now()
	n, err := s.q.SetFeedback(ctx, db.SetFeedbackParams{ID: a.ID, StudentID: me.UserID, Helpful: &helpful,
		Comment: comment, Now: &now})
	if err != nil {
		return nil, err
	}
	if n == 0 { // заявка не завершена
		return nil, invalidTransition()
	}
	platform.Log(ctx).Info("application", "event", "feedback", "application_id", a.ID.String(), "helpful", req.Body.Helpful)
	if a, err = s.q.GetStudentApplication(ctx, db.GetStudentApplicationParams{ID: a.ID, StudentID: me.UserID}); err != nil {
		return nil, err
	}
	view, err := s.details(ctx, a, st)
	if err != nil {
		return nil, err
	}
	return api.PutMyFeedback200JSONResponse(view), nil
}

// PostMyMessage — вопрос или уточнение студента. В needs_info заявка возвращается деканату (Б5).
func (s *Server) PostMyMessage(ctx context.Context, req api.PostMyMessageRequestObject) (api.PostMyMessageResponseObject, error) {
	me, a, err := s.mine(ctx, req.ApplicationId)
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
	snap, err := parseSnapshot(a)
	if err != nil {
		return nil, err
	}
	reopen := a.Status == string(api.NeedsInfo)
	m, err := s.addMessage(ctx, a, string(api.MessageAuthorRoleStudent), me.UserID, snap.ShortName, text,
		func(q *db.Queries) error {
			if !reopen {
				return nil
			}
			return setStatus(ctx, q, a, api.InProgress, actorStudent, &me.UserID, nil, s.now())
		})
	if err != nil {
		return nil, err
	}
	s.messageAdded(ctx, a, st, m)
	if reopen {
		s.statusChanged(ctx, a, st, &a.Status, api.InProgress, nil)
	}
	return api.PostMyMessage201JSONResponse(toMessage(m)), nil
}

// addMessage — сообщение и отметка «последнее сообщение» в одной транзакции; also — дополнительные шаги в ней же.
func (s *Server) addMessage(ctx context.Context, a db.Application, role string, authorID uuid.UUID, label, text string,
	also func(q *db.Queries) error) (db.Message, error) {
	now := s.now()
	var m db.Message
	err := s.tx(ctx, func(q *db.Queries) error {
		var err error
		m, err = q.InsertMessage(ctx, db.InsertMessageParams{ID: uuid.New(), ApplicationID: a.ID, AuthorRole: role,
			AuthorID: authorID, AuthorLabel: label, Text: text, Now: now})
		if err != nil {
			return err
		}
		if err := q.TouchLastMessage(ctx, db.TouchLastMessageParams{ID: a.ID, Now: &now, AuthorRole: &role}); err != nil {
			return err
		}
		if also != nil {
			return also(q)
		}
		return nil
	})
	return m, err
}

// ---------- Вложения студента ----------

func (s *Server) UploadMyAttachment(ctx context.Context, req api.UploadMyAttachmentRequestObject) (api.UploadMyAttachmentResponseObject, error) {
	me, a, err := s.mine(ctx, req.ApplicationId)
	if err != nil {
		return nil, err
	}
	st, err := s.q.GetServiceType(ctx, a.ServiceTypeID)
	if err != nil {
		return nil, err
	}
	if !st.AttachmentsAllowed || (a.Status != string(api.Submitted) && a.Status != string(api.NeedsInfo)) {
		return nil, invalidTransition()
	}
	// Файл в ответ на «Нужны уточнения» возвращает заявку в работу — как и сообщение (экран обещает это студенту)
	reopen := a.Status == string(api.NeedsInfo)
	att, err := s.saveUpload(ctx, a, req.Body, string(api.AttachmentUploadedByRoleStudent), me.UserID, false,
		func(q *db.Queries) error {
			if !reopen {
				return nil
			}
			return setStatus(ctx, q, a, api.InProgress, actorStudent, &me.UserID, nil, s.now())
		})
	if err != nil {
		return nil, err
	}
	if reopen {
		s.statusChanged(ctx, a, st, &a.Status, api.InProgress, nil)
	}
	return api.UploadMyAttachment201JSONResponse(att), nil
}

func (s *Server) DownloadMyAttachment(ctx context.Context, req api.DownloadMyAttachmentRequestObject) (api.DownloadMyAttachmentResponseObject, error) {
	_, a, err := s.mine(ctx, req.ApplicationId)
	if err != nil {
		return nil, err
	}
	f, err := s.q.GetAttachment(ctx, db.GetAttachmentParams{ID: req.AttachmentId, ApplicationID: a.ID})
	if err != nil {
		return nil, notFound(err)
	}
	return api.DownloadMyAttachment200ApplicationoctetStreamResponse{FileContentApplicationoctetStreamResponse: fileContent(f)}, nil
}

// ---------- Справка (Б6) ----------

func (s *Server) DownloadMyCertificate(ctx context.Context, req api.DownloadMyCertificateRequestObject) (api.DownloadMyCertificateResponseObject, error) {
	_, a, err := s.mine(ctx, req.ApplicationId)
	if err != nil {
		return nil, err
	}
	if a.Status != string(api.Ready) {
		return nil, platform.NotFound()
	}
	c, err := s.q.GetCertificateByApplication(ctx, a.ID) // есть только у instant_certificate
	if err != nil {
		return nil, notFound(err)
	}
	snap, err := parseSnapshot(a)
	if err != nil {
		return nil, err
	}
	var values map[string]string
	if err := json.Unmarshal(a.Fields, &values); err != nil {
		return nil, err
	}
	pdf, err := certificate.Render(certificate.Data{
		Number: number(a.Number), Code: c.Code, VerifyURL: s.siteURL + verifyPath(c.Code),
		IssuedAt: c.IssuedAt.In(msk), ValidUntil: c.ValidUntil.Time,
		FullName: snap.FullName, FacultyName: snap.FacultyName, ProgramCode: snap.ProgramCode,
		ProgramName: snap.ProgramName, StudyLevel: snap.StudyLevel, Course: snap.Course,
		StudyForm: snap.StudyForm, Funding: snap.Funding,
		Purpose: values["purpose"], Destination: values["destination"],
	})
	if err != nil {
		return nil, err
	}
	return api.DownloadMyCertificate200ApplicationpdfResponse{
		Body: bytes.NewReader(pdf), ContentLength: int64(len(pdf)),
		Headers: api.DownloadMyCertificate200ResponseHeaders{ContentDisposition: disposition("spravka-" + number(a.Number) + ".pdf")},
	}, nil
}

var certCodeRe = regexp.MustCompile(`^[A-Z2-7]{10}$`)

// VerifyCertificate — публичная проверка справки или студенческого: только инициалы, факультет и даты.
func (s *Server) VerifyCertificate(ctx context.Context, req api.VerifyCertificateRequestObject) (api.VerifyCertificateResponseObject, error) {
	now := s.now()
	ip, _ := platform.ClientIP(platform.RequestFrom(ctx))
	if ok, retry := s.verify.allow(ip, now); !ok {
		platform.Log(ctx).Warn("security", "event", "certificate_verify_limited", "ip", ip.String())
		return nil, platform.TooManyAttempts(retry)
	}
	if !certCodeRe.MatchString(req.Code) {
		return nil, platform.NotFound()
	}
	c, err := s.q.GetCertificate(ctx, req.Code)
	if errors.Is(err, pgx.ErrNoRows) { // не справка — может быть, студенческий
		return s.verifyStudentCard(ctx, req.Code, now)
	}
	if err != nil {
		return nil, err
	}
	out := api.VerifyCertificate200JSONResponse{Kind: api.CertificateVerificationKindCertificate,
		Valid: !dateMSK(now).After(c.ValidUntil.Time), Title: c.Title,
		Holder: c.Holder, FacultyShort: c.FacultyShort, IssuedAt: c.IssuedAt.In(msk)}
	out.ValidUntil.Time = c.ValidUntil.Time
	return out, nil
}

// ---------- Вспомогательное ----------

func page(limit, offset *int) (lim, off int32, err error) {
	l, o := 20, 0
	if limit != nil {
		l = *limit
	}
	if offset != nil {
		o = *offset
	}
	fields := map[string]string{}
	if l < 1 || l > 100 {
		fields["limit"] = "От 1 до 100"
	}
	if o < 0 || o > math.MaxInt32 {
		fields["offset"] = "Неверное смещение"
	}
	if len(fields) > 0 {
		return 0, 0, platform.Validation(fields)
	}
	return int32(l), int32(o), nil
}

func statusStrings(f *api.StatusFilter) []string {
	out := []string{}
	if f != nil {
		for _, st := range *f {
			out = append(out, string(st))
		}
	}
	return out
}

// optionalText — обрезанный текст или nil, если пусто.
func optionalText(p *string) *string {
	if p == nil {
		return nil
	}
	v := strings.TrimSpace(*p)
	if v == "" {
		return nil
	}
	return &v
}

func messageText(body *api.MessageRequest) (string, error) {
	var text string
	if body != nil {
		text = strings.TrimSpace(body.Text)
	}
	switch {
	case text == "":
		return "", platform.Validation(map[string]string{"text": "Напишите сообщение"})
	case utf8.RuneCountInString(text) > maxMessageLen:
		return "", platform.Validation(map[string]string{"text": "Не больше 4000 символов"})
	}
	return text, nil
}

func closedForMessages(status string) bool {
	return status == string(api.Rejected) || status == string(api.Cancelled)
}
