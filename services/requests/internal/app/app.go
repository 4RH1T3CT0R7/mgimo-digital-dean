// Package app — логика сервиса requests: каталог услуг, заявки, переписка, вложения, справки, кабинет сотрудника.
// Сделан по образцу services/auth (см. services/auth/README.md).
package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/netip"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/clients/academic"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/events"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/platform"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/requests/internal/api"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/requests/internal/db"
)

const (
	MaxFileSize     = 5 << 20              // 5 МБ (requests.yaml)
	maxBody         = MaxFileSize + 64<<10 // запас на служебные части multipart
	VerifyPerMinute = 30                   // проверок справки в минуту с одного IP
	certValidDays   = 30                   // Б6
	maxCommentLen   = 2000
	maxMessageLen   = 4000
	maxQueryLen     = 100
)

var msk = time.FixedZone("Europe/Moscow", 3*60*60)

// Server реализует StrictServerInterface публичного API.
type Server struct {
	pool     *pgxpool.Pool
	q        *db.Queries
	log      *slog.Logger
	now      func() time.Time // в тестах подменяется; time.Now вызывается только в main
	bus      *events.Bus      // nil — события не публикуются (тесты без NATS)
	academic *academic.ClientWithResponses
	siteURL  string // https://домен — для адреса проверки в PDF; пусто — адрес относительный
	verify   limiter
}

func New(pool *pgxpool.Pool, log *slog.Logger, now func() time.Time, bus *events.Bus,
	ac *academic.ClientWithResponses, siteURL string) *Server {
	return &Server{pool: pool, q: db.New(pool), log: log, now: now, bus: bus, academic: ac, siteURL: siteURL}
}

// Handlers собирает публичный (8080) и внутренний (8081) обработчики. Внутреннего API у requests нет.
func (s *Server) Handlers() (public, internal http.Handler) {
	strict := api.StrictHTTPServerOptions{
		RequestErrorHandlerFunc:  platform.RequestErrorHandler,
		ResponseErrorHandlerFunc: platform.ResponseErrorHandler,
	}
	pub := api.HandlerWithOptions(api.NewStrictHandlerWithOptions(s, nil, strict), api.StdHTTPServerOptions{
		BaseRouter:       platform.NewMux(),
		ErrorHandlerFunc: platform.RequestErrorHandler,
	})
	return platform.Middleware(s.log, withLimits(pub)), platform.Middleware(s.log, platform.NewMux())
}

// withLimits: тело запроса не больше maxBody (security.md §3, вложения), браузер не угадывает тип ответа.
func withLimits(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		r.Body = http.MaxBytesReader(w, r.Body, maxBody)
		next.ServeHTTP(w, r)
	})
}

// ---------- Доступ к заявке ----------

// mine — заявка студента из сессии. Чужая или несуществующая → 404 (IDOR, security.md §3).
func (s *Server) mine(ctx context.Context, id uuid.UUID) (platform.Identity, db.Application, error) {
	me, err := platform.RequireStudent(ctx)
	if err != nil {
		return me, db.Application{}, err
	}
	a, err := s.q.GetStudentApplication(ctx, db.GetStudentApplicationParams{ID: id, StudentID: me.UserID})
	return me, a, notFound(err)
}

// scoped — заявка для сотрудника: staff — только своего факультета, admin — любая. Иначе 404.
func (s *Server) scoped(ctx context.Context, id uuid.UUID) (platform.Identity, db.Application, error) {
	me, err := platform.RequireStaffOrAdmin(ctx)
	if err != nil {
		return me, db.Application{}, err
	}
	a, err := s.q.GetScopedApplication(ctx, db.GetScopedApplicationParams{ID: id, FacultyID: me.FacultyScope()})
	return me, a, notFound(err)
}

func notFound(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return platform.NotFound()
	}
	return err
}

func invalidTransition() error {
	return platform.Conflict("invalid_transition", "Это действие недоступно в текущем статусе заявки")
}

func (s *Server) tx(ctx context.Context, fn func(q *db.Queries) error) error {
	return pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error { return fn(s.q.WithTx(tx)) })
}

// setStatus — переход по Б5 внутри транзакции с записью в историю. Событие публикует вызывающий после коммита.
func setStatus(ctx context.Context, q *db.Queries, a db.Application, to api.ApplicationStatus, by actor,
	actorID *uuid.UUID, comment *string, now time.Time) error {
	if !canTransition(api.ApplicationStatus(a.Status), to, by) {
		return invalidTransition()
	}
	n, err := q.UpdateStatus(ctx, db.UpdateStatusParams{ID: a.ID, OldStatus: a.Status, NewStatus: string(to),
		Now: now, Terminal: isTerminal(to)})
	if err != nil {
		return err
	}
	if n == 0 { // статус успели сменить параллельно
		return invalidTransition()
	}
	return q.InsertStatusHistory(ctx, db.InsertStatusHistoryParams{ApplicationID: a.ID, Status: string(to),
		Comment: comment, ActorRole: string(by), ActorID: actorID, Now: now})
}

// ---------- События (после коммита; ошибка — только в лог, events.md) ----------

func publish[T events.Event](ctx context.Context, s *Server, e T) {
	if s.bus == nil {
		return
	}
	if err := events.Publish(ctx, s.bus, e); err != nil {
		platform.Log(ctx).Error("event_publish_failed", "subject", e.Subject(), "error", err.Error())
	}
}

func (s *Server) statusChanged(ctx context.Context, a db.Application, st db.ServiceType, from *string,
	to api.ApplicationStatus, comment *string) {
	platform.Log(ctx).Info("application", "event", "status_changed", "application_id", a.ID.String(), "status", string(to))
	publish(ctx, s, events.ApplicationStatusChanged{ApplicationID: a.ID, Number: number(a.Number),
		StudentID: a.StudentID, FacultyID: a.FacultyID, ServiceTypeID: st.ID, ServiceTitle: st.Title,
		OldStatus: from, NewStatus: string(to), Comment: comment})
}

func (s *Server) messageAdded(ctx context.Context, a db.Application, st db.ServiceType, m db.Message) {
	platform.Log(ctx).Info("application", "event", "message_added", "application_id", a.ID.String(), "author_role", m.AuthorRole)
	publish(ctx, s, events.ApplicationMessageAdded{ApplicationID: a.ID, Number: number(a.Number),
		StudentID: a.StudentID, ServiceTypeID: st.ID, ServiceTitle: st.Title,
		AuthorRole: m.AuthorRole, AuthorLabel: m.AuthorLabel})
}

// ---------- Слепок студента (D32) ----------

type snapshot struct {
	FullName      string `json:"full_name"`
	ShortName     string `json:"short_name"`
	FacultyShort  string `json:"faculty_short"`
	FacultyName   string `json:"faculty_name"`
	ProgramCode   string `json:"program_code"`
	ProgramName   string `json:"program_name"`
	Course        int    `json:"course"`
	GroupName     string `json:"group_name"`
	StudentCardNo string `json:"student_card_no"`
	StudyForm     string `json:"study_form"`
	Funding       string `json:"funding"`
	StudyLevel    string `json:"study_level"`
}

func snapshotFromCard(c *academic.StudentCard) snapshot {
	return snapshot{FullName: c.FullName, ShortName: c.ShortName, FacultyShort: c.FacultyShort,
		FacultyName: c.FacultyName, ProgramCode: c.ProgramCode, ProgramName: c.ProgramName, Course: c.Course,
		GroupName: c.GroupName, StudentCardNo: c.StudentCardNo, StudyForm: string(c.StudyForm),
		Funding: string(c.Funding), StudyLevel: string(c.StudyLevel)}
}

func parseSnapshot(a db.Application) (snapshot, error) {
	var sn snapshot
	err := json.Unmarshal(a.StudentSnapshot, &sn)
	return sn, err
}

func (s *Server) studentCard(ctx context.Context, id uuid.UUID) (*academic.StudentCard, error) {
	resp, err := s.academic.GetStudentCardWithResponse(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("academic getStudentCard: %w", err)
	}
	if resp.JSON200 == nil {
		return nil, fmt.Errorf("academic getStudentCard: статус %d", resp.StatusCode())
	}
	return resp.JSON200, nil
}

// ---------- Преобразования в ответы API ----------

func number(n int64) string { return fmt.Sprintf("%06d", n) }

func inMSK(t *time.Time) *time.Time {
	if t == nil {
		return nil
	}
	v := t.In(msk)
	return &v
}

// dateMSK — календарная дата по Москве (полночь UTC — так её хранит pgtype.Date).
func dateMSK(t time.Time) time.Time {
	y, m, d := t.In(msk).Date()
	return time.Date(y, m, d, 0, 0, 0, 0, time.UTC)
}

func formFields(st db.ServiceType) ([]api.FormField, error) {
	var defs []api.FormField
	if err := json.Unmarshal(st.Fields, &defs); err != nil {
		return nil, fmt.Errorf("поля услуги %s: %w", st.ID, err)
	}
	return defs, nil
}

func toServiceType(st db.ServiceType) (api.ServiceType, error) {
	defs, err := formFields(st)
	if err != nil {
		return api.ServiceType{}, err
	}
	out := api.ServiceType{Id: st.ID, Title: st.Title, Description: st.Description,
		Category: api.ServiceTypeCategory(st.Category), Kind: api.ServiceKind(st.Kind), SlaDays: int(st.SlaDays),
		Fields: defs}
	out.Attachments.Allowed, out.Attachments.Required, out.Attachments.Hint =
		st.AttachmentsAllowed, st.AttachmentsRequired, st.AttachmentsHint
	return out, nil
}

func (s *Server) serviceTypes(ctx context.Context) (map[string]db.ServiceType, error) {
	rows, err := s.q.ListAllServiceTypes(ctx)
	if err != nil {
		return nil, err
	}
	m := make(map[string]db.ServiceType, len(rows))
	for _, r := range rows {
		m[r.ID] = r
	}
	return m, nil
}

func summary(a db.Application, st db.ServiceType, now time.Time) api.ApplicationSummary {
	overdue := isOverdue(api.ApplicationStatus(a.Status), a.DueAt, now)
	return api.ApplicationSummary{
		Id: a.ID, Number: number(a.Number), Status: api.ApplicationStatus(a.Status),
		ServiceType: api.ServiceTypeRef{Id: st.ID, Title: st.Title, Kind: api.ServiceKind(st.Kind)},
		CreatedAt:   a.CreatedAt.In(msk), UpdatedAt: a.UpdatedAt.In(msk), DueAt: inMSK(a.DueAt), Overdue: &overdue,
		LastMessageAt: inMSK(a.LastMessageAt), LastMessageFrom: (*api.ApplicationSummaryLastMessageFrom)(a.LastMessageFrom),
	}
}

func studentView(a db.Application) (api.StudentSnapshot, error) {
	sn, err := parseSnapshot(a)
	return api.StudentSnapshot{Id: a.StudentID, FullName: sn.FullName, ShortName: sn.ShortName,
		FacultyShort: sn.FacultyShort, Course: sn.Course, GroupName: sn.GroupName, StudentCardNo: sn.StudentCardNo}, err
}

// fieldValue — элемент Application.fields (тип совпадает с анонимной структурой в api).
type fieldValue = struct {
	Key   string `json:"key"`
	Label string `json:"label"`
	Value string `json:"value"`
}

// details — заявка целиком: поля в порядке формы, история, переписка, вложения, справка.
func (s *Server) details(ctx context.Context, a db.Application, st db.ServiceType) (api.Application, error) {
	defs, err := formFields(st)
	if err != nil {
		return api.Application{}, err
	}
	var values map[string]string
	if err := json.Unmarshal(a.Fields, &values); err != nil {
		return api.Application{}, err
	}
	hist, err := s.q.ListStatusHistory(ctx, a.ID)
	if err != nil {
		return api.Application{}, err
	}
	msgs, err := s.q.ListMessages(ctx, a.ID)
	if err != nil {
		return api.Application{}, err
	}
	atts, err := s.q.ListAttachments(ctx, a.ID)
	if err != nil {
		return api.Application{}, err
	}

	sum := summary(a, st, s.now())
	out := api.Application{
		Id: sum.Id, Number: sum.Number, ServiceType: sum.ServiceType, Status: sum.Status,
		CreatedAt: sum.CreatedAt, UpdatedAt: sum.UpdatedAt, DueAt: sum.DueAt, Overdue: sum.Overdue,
		LastMessageAt: sum.LastMessageAt, LastMessageFrom: (*api.ApplicationLastMessageFrom)(sum.LastMessageFrom),
		Comment:       a.Comment,
		Fields:        make([]fieldValue, 0, len(defs)),
		StatusHistory: make([]api.StatusHistoryEntry, 0, len(hist)),
		Messages:      make([]api.Message, 0, len(msgs)),
		Attachments:   make([]api.Attachment, 0, len(atts)),
	}
	for _, f := range defs {
		if v, ok := values[f.Key]; ok {
			out.Fields = append(out.Fields, fieldValue{Key: f.Key, Label: f.Label, Value: v})
		}
	}
	for _, h := range hist {
		out.StatusHistory = append(out.StatusHistory, api.StatusHistoryEntry{Status: api.ApplicationStatus(h.Status),
			At: h.CreatedAt.In(msk), ByRole: api.StatusHistoryEntryByRole(h.ActorRole), Comment: h.Comment})
	}
	for _, m := range msgs {
		out.Messages = append(out.Messages, toMessage(m))
	}
	for _, t := range atts {
		out.Attachments = append(out.Attachments, api.Attachment{Id: t.ID, FileName: t.FileName,
			ContentType: api.AttachmentContentType(t.ContentType), Size: int(t.Size),
			UploadedByRole: api.AttachmentUploadedByRole(t.UploadedByRole), IsResult: t.IsResult, CreatedAt: t.CreatedAt.In(msk)})
	}
	if st.Kind == string(api.InstantCertificate) && a.Status == string(api.Ready) {
		c, err := s.q.GetCertificateByApplication(ctx, a.ID)
		if err != nil {
			return api.Application{}, err
		}
		info := api.CertificateInfo{Code: c.Code, IssuedAt: c.IssuedAt.In(msk), VerifyUrl: verifyPath(c.Code)}
		info.ValidUntil.Time = c.ValidUntil.Time
		out.Certificate = &info
	}
	if a.FeedbackHelpful != nil && a.FeedbackAt != nil {
		out.Feedback = &api.Feedback{Helpful: *a.FeedbackHelpful, Comment: a.FeedbackComment, At: a.FeedbackAt.In(msk)}
	}
	return out, nil
}

func toMessage(m db.Message) api.Message {
	return api.Message{Id: m.ID, AuthorRole: api.MessageAuthorRole(m.AuthorRole), AuthorLabel: m.AuthorLabel,
		Text: m.Text, CreatedAt: m.CreatedAt.In(msk)}
}

func verifyPath(code string) string { return "/verify/" + code }

// ---------- Лимит проверок справки ----------

// limiter — фиксированное окно в одну минуту по IP.
// ponytail: в памяти одной копии сервиса; при нескольких копиях хранить попытки в БД, как login_attempts в auth.
type limiter struct {
	mu     sync.Mutex
	window time.Time
	hits   map[netip.Addr]int
}

func (l *limiter) allow(ip netip.Addr, now time.Time) (ok bool, retryAfterSec int) {
	l.mu.Lock()
	defer l.mu.Unlock()
	w := now.Truncate(time.Minute)
	if !w.Equal(l.window) {
		l.window, l.hits = w, map[netip.Addr]int{}
	}
	l.hits[ip]++
	return l.hits[ip] <= VerifyPerMinute, int(w.Add(time.Minute).Sub(now).Seconds()) + 1
}
