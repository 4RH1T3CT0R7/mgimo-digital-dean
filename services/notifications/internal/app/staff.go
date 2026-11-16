package app

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/clients/academic"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/platform"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/notifications/internal/api"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/notifications/internal/db"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// serviceTypeID — slug услуги из каталога requests (`financial-aid`).
var serviceTypeID = regexp.MustCompile(`^[a-z0-9-]{1,64}$`)

func normalizeAudience(ctx context.Context, ac *academic.ClientWithResponses, id platform.Identity, a api.Audience) (api.Audience, error) {
	invalid := func(message string) (api.Audience, error) {
		return api.Audience{}, platform.Validation(map[string]string{"audience": message})
	}
	out := api.Audience{Kind: a.Kind}
	if a.Kind == api.All && id.Role == platform.RoleAdmin {
		return out, nil
	}
	if a.Kind != api.Faculty && a.Kind != api.Course && a.Kind != api.Group {
		return invalid("Выберите доступного адресата")
	}
	out.FacultyId = a.FacultyId
	if scope := id.FacultyScope(); scope != nil {
		if a.FacultyId != nil && *a.FacultyId != *scope {
			return invalid("Выберите адресата своего факультета")
		}
		out.FacultyId = scope
	}
	if a.Kind == api.Group {
		if a.GroupId == nil || *a.GroupId == uuid.Nil {
			return invalid("Выберите группу")
		}
		r, err := ac.GetGroupWithResponse(ctx, *a.GroupId)
		if err != nil {
			return api.Audience{}, fmt.Errorf("academic getGroup: %w", err)
		}
		if r.StatusCode() == http.StatusNotFound {
			return invalid("Группа не найдена")
		}
		if r.JSON200 == nil || r.JSON200.Id != *a.GroupId || r.JSON200.FacultyId == uuid.Nil {
			return api.Audience{}, fmt.Errorf("academic getGroup: неверный ответ, статус %d", r.StatusCode())
		}
		if out.FacultyId != nil && *out.FacultyId != r.JSON200.FacultyId {
			return invalid("Группа относится к другому факультету")
		}
		out.FacultyId = &r.JSON200.FacultyId
		out.GroupId = a.GroupId
	}
	if out.FacultyId == nil || *out.FacultyId == uuid.Nil {
		return invalid("Выберите факультет")
	}
	if a.Kind == api.Course {
		if a.Course == nil || *a.Course < 1 || *a.Course > 6 {
			return invalid("Укажите курс от 1 до 6")
		}
		out.Course = a.Course
	}
	return out, nil
}

func validText(s string, min, max int) bool {
	n := utf8.RuneCountInString(s)
	return n >= min && n <= max && !strings.ContainsRune(s, 0)
}

func toCourse32(course *int) *int32 {
	if course == nil {
		return nil
	}
	value := int32(*course)
	return &value
}

func audience(kind string, faculty, group *uuid.UUID, course *int32, user *uuid.UUID) api.Audience {
	a := api.Audience{Kind: api.AudienceKind(kind), FacultyId: faculty, GroupId: group, UserId: user}
	if course != nil {
		c := int(*course)
		a.Course = &c
	}
	return a
}

func announcement(row db.Notification, read, acked, going int64) api.StaffAnnouncement {
	readCount, ackedCount, goingCount := int(read), int(acked), int(going)
	item := api.StaffAnnouncement{
		Id: row.ID, Type: api.StaffAnnouncementType(row.Type), Title: row.Title, Body: row.Body, Important: row.Important,
		RequiresAck: row.RequiresAck, CreatedAt: row.CreatedAt.In(moscow), ReadCount: &readCount,
		Audience:      audience(row.AudienceKind, row.AudienceFacultyID, row.AudienceGroupID, row.AudienceCourse, row.AudienceUserID),
		EventStartsAt: inMoscow(row.EventStartsAt), EventPlace: row.EventPlace,
	}
	if row.RequiresAck {
		item.AckedCount = &ackedCount
	}
	if row.EventStartsAt != nil {
		item.GoingCount = &goingCount
	}
	return item
}

// logAdmin — журнал действий сотрудника и администратора: только тип действия и ID, без текстов и ПДн.
func logAdmin(ctx context.Context, id platform.Identity, event string, objectID uuid.UUID) {
	platform.Log(ctx).Info("admin", "event", event, "id", objectID.String(), "role", string(id.Role))
}

func (s *Server) ListStaffAnnouncements(ctx context.Context, req api.ListStaffAnnouncementsRequestObject) (api.ListStaffAnnouncementsResponseObject, error) {
	id, err := platform.RequireStaffOrAdmin(ctx)
	if err != nil {
		return nil, err
	}
	limit, offset, err := pagination(req.Params.Limit, req.Params.Offset)
	if err != nil {
		return nil, err
	}
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	q := s.q.WithTx(tx)
	total, err := q.CountStaffAnnouncements(ctx, id.FacultyScope())
	if err != nil {
		return nil, err
	}
	rows, err := q.ListStaffAnnouncements(ctx, db.ListStaffAnnouncementsParams{Scope: id.FacultyScope(), PageLimit: limit, PageOffset: offset})
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	items := make([]api.StaffAnnouncement, 0, len(rows))
	for _, row := range rows {
		items = append(items, announcement(row.Notification, row.ReadCount, row.AckedCount, row.GoingCount))
	}
	return api.ListStaffAnnouncements200JSONResponse{Items: items, Total: int(total)}, nil
}

// authorLabel — подпись публикации: «Деканат ФМО» по короткому названию факультета из academic.
func (s *Server) authorLabel(ctx context.Context, id platform.Identity) (string, error) {
	if id.Role == platform.RoleAdmin {
		return "Администрация", nil
	}
	r, err := s.academic.GetFacultyWithResponse(ctx, *id.FacultyScope())
	if err != nil {
		return "", fmt.Errorf("academic getFaculty: %w", err)
	}
	if r.StatusCode() == http.StatusNotFound {
		return "Деканат", nil
	}
	if r.JSON200 == nil {
		return "", fmt.Errorf("academic getFaculty: неверный ответ, статус %d", r.StatusCode())
	}
	return "Деканат " + r.JSON200.ShortName, nil
}

func (s *Server) CreateAnnouncement(ctx context.Context, req api.CreateAnnouncementRequestObject) (api.CreateAnnouncementResponseObject, error) {
	id, err := platform.RequireStaffOrAdmin(ctx)
	if err != nil {
		return nil, err
	}
	if req.Body == nil {
		return nil, platform.Validation(map[string]string{"body": "Укажите данные объявления"})
	}
	b := req.Body
	title, body := strings.TrimSpace(b.Title), strings.TrimSpace(b.Body)
	fields := map[string]string{}
	if !validText(title, 3, 120) {
		fields["title"] = "Введите от 3 до 120 символов"
	}
	if !validText(body, 1, 4000) {
		fields["body"] = "Введите от 1 до 4000 символов"
	}
	if b.Type != api.CreateAnnouncementRequestTypeAnnouncement && b.Type != api.CreateAnnouncementRequestTypeNews {
		fields["type"] = "Выберите новость или объявление"
	}
	if b.RequiresAck && b.Type != api.CreateAnnouncementRequestTypeAnnouncement {
		fields["requires_ack"] = "Подтверждение можно запросить только для объявления"
	}
	now := s.now()
	var place *string
	if b.EventPlace != nil {
		p := strings.TrimSpace(*b.EventPlace)
		place = &p
	}
	switch {
	case b.EventStartsAt == nil && place == nil:
	case b.Type != api.CreateAnnouncementRequestTypeNews:
		fields["event_starts_at"] = "Мероприятием может быть только новость"
	case b.EventStartsAt == nil:
		fields["event_starts_at"] = "Укажите дату и время мероприятия"
	case place == nil || !validText(*place, 1, 120):
		fields["event_place"] = "Укажите место: до 120 символов"
	case !b.EventStartsAt.After(now):
		fields["event_starts_at"] = "Мероприятие должно быть в будущем"
	}
	if len(fields) != 0 {
		return nil, platform.Validation(fields)
	}
	a, err := normalizeAudience(ctx, s.academic, id, b.Audience)
	if err != nil {
		return nil, err
	}
	label, err := s.authorLabel(ctx, id)
	if err != nil {
		return nil, err
	}
	row, err := s.q.InsertAnnouncement(ctx, db.InsertAnnouncementParams{
		Type: string(b.Type), Title: title, Body: body, Important: b.Important, RequiresAck: b.RequiresAck,
		AudienceKind: string(a.Kind), AudienceFacultyID: a.FacultyId, AudienceCourse: toCourse32(a.Course),
		AudienceGroupID: a.GroupId, AuthorID: &id.UserID, AuthorLabel: &label, CreatedAt: now,
		EventStartsAt: b.EventStartsAt, EventPlace: place,
	})
	if err != nil {
		return nil, err
	}
	logAdmin(ctx, id, "announcement_created", row.ID)
	return api.CreateAnnouncement201JSONResponse(announcement(row, 0, 0, 0)), nil
}

func (s *Server) GetAnnouncementAcks(ctx context.Context, req api.GetAnnouncementAcksRequestObject) (api.GetAnnouncementAcksResponseObject, error) {
	id, err := platform.RequireStaffOrAdmin(ctx)
	if err != nil {
		return nil, err
	}
	row, err := s.q.FindStaffAnnouncement(ctx, db.FindStaffAnnouncementParams{ItemID: req.AnnouncementId, Scope: id.FacultyScope()})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, platform.NotFound()
	}
	if err != nil {
		return nil, err
	}
	a := audience(row.AudienceKind, row.AudienceFacultyID, row.AudienceGroupID, row.AudienceCourse, row.AudienceUserID)
	r, err := s.academic.ResolveAudienceWithResponse(ctx, academic.Audience{
		Kind: academic.AudienceKind(a.Kind), Course: a.Course, FacultyId: a.FacultyId, GroupId: a.GroupId, UserId: a.UserId,
	})
	if err != nil {
		return nil, fmt.Errorf("academic resolveAudience: %w", err)
	}
	if r.JSON200 == nil {
		return nil, fmt.Errorf("academic resolveAudience: неверный ответ, статус %d", r.StatusCode())
	}
	students := r.JSON200.Students
	class := make([]uuid.UUID, 0, len(students))
	for _, student := range students {
		class = append(class, student.Id)
	}
	receipts, err := s.q.ListAcknowledgedStudents(ctx, db.ListAcknowledgedStudentsParams{
		ItemID: row.ID, StudentIds: class, Scope: id.FacultyScope(),
	})
	if err != nil {
		return nil, err
	}
	ackedAt := make(map[uuid.UUID]*time.Time, len(receipts))
	for _, receipt := range receipts {
		ackedAt[receipt.UserID] = receipt.AckedAt
	}
	// Порядок — как в resolveAudience: academic сортирует по ФИО с учётом «Ё».
	out := api.GetAnnouncementAcks200JSONResponse{Total: len(students), Acked: []api.AckStudent{}, NotAcked: []api.AckStudent{}}
	for _, student := range students {
		entry := api.AckStudent{Id: student.Id, ShortName: student.ShortName, GroupName: student.GroupName, AckedAt: inMoscow(ackedAt[student.Id])}
		if entry.AckedAt == nil {
			out.NotAcked = append(out.NotAcked, entry)
		} else {
			out.Acked = append(out.Acked, entry)
		}
	}
	return out, nil
}

func staffDeadline(row db.Deadline, now time.Time) api.StaffDeadline {
	d := deadline(row, now)
	return api.StaffDeadline{Id: d.Id, Title: d.Title, Description: d.Description, Kind: d.Kind, DueAt: d.DueAt,
		DaysLeft: d.DaysLeft, ServiceTypeId: d.ServiceTypeId, CreatedAt: row.CreatedAt.In(moscow),
		Audience: audience(row.AudienceKind, row.AudienceFacultyID, row.AudienceGroupID, row.AudienceCourse, row.AudienceUserID)}
}

func (s *Server) ListStaffDeadlines(ctx context.Context, _ api.ListStaffDeadlinesRequestObject) (api.ListStaffDeadlinesResponseObject, error) {
	id, err := platform.RequireStaffOrAdmin(ctx)
	if err != nil {
		return nil, err
	}
	rows, err := s.q.ListStaffDeadlines(ctx, id.FacultyScope())
	if err != nil {
		return nil, err
	}
	now := s.now()
	out := make(api.ListStaffDeadlines200JSONResponse, 0, len(rows))
	for _, row := range rows {
		out = append(out, staffDeadline(row, now))
	}
	return out, nil
}

func (s *Server) CreateDeadline(ctx context.Context, req api.CreateDeadlineRequestObject) (api.CreateDeadlineResponseObject, error) {
	id, err := platform.RequireStaffOrAdmin(ctx)
	if err != nil {
		return nil, err
	}
	if req.Body == nil {
		return nil, platform.Validation(map[string]string{"body": "Укажите данные дедлайна"})
	}
	b := req.Body
	now := s.now()
	title := strings.TrimSpace(b.Title)
	var description *string
	if b.Description != nil {
		if d := strings.TrimSpace(*b.Description); d != "" {
			description = &d
		}
	}
	fields := map[string]string{}
	if !validText(title, 3, 120) {
		fields["title"] = "Введите от 3 до 120 символов"
	}
	if description != nil && !validText(*description, 1, 1000) {
		fields["description"] = "Введите до 1000 символов без недопустимых знаков"
	}
	if !b.DueAt.After(now) {
		fields["due_at"] = "Укажите срок в будущем"
	}
	switch b.Kind {
	case api.DeadlineKindApplication, api.DeadlineKindCoursework, api.DeadlineKindCredit, api.DeadlineKindExam, api.DeadlineKindOther:
	default:
		fields["kind"] = "Выберите тип дедлайна"
	}
	switch {
	case b.ServiceTypeId == nil:
	case b.Kind != api.DeadlineKindApplication:
		fields["service_type_id"] = "Услугу можно указать для срока подачи заявлений"
	case !serviceTypeID.MatchString(*b.ServiceTypeId):
		fields["service_type_id"] = "Неверный идентификатор услуги"
	}
	if len(fields) != 0 {
		return nil, platform.Validation(fields)
	}
	a, err := normalizeAudience(ctx, s.academic, id, b.Audience)
	if err != nil {
		return nil, err
	}
	row, err := s.q.InsertDeadline(ctx, db.InsertDeadlineParams{
		Title: title, Description: description, Kind: string(b.Kind), DueAt: b.DueAt, ServiceTypeID: b.ServiceTypeId,
		AudienceKind: string(a.Kind), AudienceFacultyID: a.FacultyId, AudienceCourse: toCourse32(a.Course),
		AudienceGroupID: a.GroupId, AuthorID: &id.UserID, CreatedAt: now,
	})
	if err != nil {
		return nil, err
	}
	logAdmin(ctx, id, "deadline_created", row.ID)
	return api.CreateDeadline201JSONResponse(staffDeadline(row, now)), nil
}

func (s *Server) DeleteDeadline(ctx context.Context, req api.DeleteDeadlineRequestObject) (api.DeleteDeadlineResponseObject, error) {
	id, err := platform.RequireStaffOrAdmin(ctx)
	if err != nil {
		return nil, err
	}
	n, err := s.q.DeleteStaffDeadline(ctx, db.DeleteStaffDeadlineParams{ItemID: req.DeadlineId, Scope: id.FacultyScope()})
	if err != nil {
		return nil, err
	}
	if n == 0 {
		return nil, platform.NotFound()
	}
	logAdmin(ctx, id, "deadline_deleted", req.DeadlineId)
	return api.DeleteDeadline204Response{}, nil
}
