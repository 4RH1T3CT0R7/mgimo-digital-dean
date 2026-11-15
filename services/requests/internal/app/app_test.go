package app_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/clients/academic"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/events"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/platform"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/platform/platformtest"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/requests/internal/api"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/requests/internal/app"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/requests/migrations"
)

var (
	msk        = time.FixedZone("MSK", 3*60*60)
	facultyMO  = uuid.MustParse("10000000-0000-4000-8000-000000000001")
	facultyMEO = uuid.MustParse("10000000-0000-4000-8000-000000000002")
	studentA   = uuid.MustParse("30000000-0000-4000-8000-000000000001") // ФМО
	studentB   = uuid.MustParse("30000000-0000-4000-8000-000000000002") // МЭО
	staffMO    = uuid.MustParse("40000000-0000-4000-8000-000000000001")
	staffMEO   = uuid.MustParse("40000000-0000-4000-8000-000000000002")
	adminID    = uuid.MustParse("40000000-0000-4000-8000-000000000003")

	asA        = platformtest.Student(studentA)
	asB        = platformtest.Student(studentB)
	asStaffMO  = platformtest.Staff(staffMO, facultyMO)
	asStaffMEO = platformtest.Staff(staffMEO, facultyMEO)
	asAdmin    = platformtest.Admin(adminID)
)

var cards = []academic.StudentCard{
	{Id: studentA, FullName: "Лебедева Анна Викторовна", ShortName: "Лебедева А. В.", FacultyId: facultyMO,
		FacultyShort: "ФМО", FacultyName: "Факультет международных отношений", ProgramCode: "41.03.05",
		ProgramName: "Международные отношения", StudyLevel: "bachelor", Course: 2, GroupName: "МО-24-03",
		StudentCardNo: "24-0101", StudyForm: "full_time", Funding: "budget"},
	{Id: studentB, FullName: "Соколов Максим Олегович", ShortName: "Соколов М. О.", FacultyId: facultyMEO,
		FacultyShort: "МЭО", FacultyName: "Факультет международных экономических отношений", ProgramCode: "38.03.01",
		ProgramName: "Экономика", StudyLevel: "bachelor", Course: 3, GroupName: "МЭО-23-02",
		StudentCardNo: "23-0202", StudyForm: "full_time", Funding: "contract"},
}

// Каталог для тестов (на seed тесты не опираются).
const catalogSQL = `
INSERT INTO service_types (id, title, description, category, kind, sla_days, fields, attachments_allowed, sort_order, active) VALUES
('study-certificate', 'Справка с места учёбы', 'Сразу', 'certificates', 'instant_certificate', 0,
 '[{"key":"purpose","label":"Цель","type":"select","required":true,"options":["По месту требования","Для работодателя"]},
   {"key":"destination","label":"Куда предоставляется","type":"text","required":false}]', false, 1, true),
('academic-leave', 'Академический отпуск', 'Оформляет деканат', 'deanery', 'document', 10,
 '[{"key":"reason","label":"Причина","type":"select","required":true,"options":["По медицинским показаниям","Другое"]},
   {"key":"start_date","label":"С какой даты","type":"date","required":true},
   {"key":"details","label":"Подробности","type":"textarea","required":false,"max_length":20}]', true, 2, true),
('transcript', 'Выписка оценок', 'Оформляет деканат', 'certificates', 'document', 5, '[]', false, 3, true),
('old-service', 'Снятая услуга', '', 'other', 'document', 1, '[]', false, 9, false);`

var leaveFields = map[string]string{"reason": "Другое", "start_date": "2026-12-01"}

// env — сервис на отдельной тестовой БД с поддельным academic и управляемыми часами.
type env struct {
	t     *testing.T
	pool  *pgxpool.Pool
	pub   http.Handler
	clock time.Time
	logs  *bytes.Buffer
}

func setup(t *testing.T, bus *events.Bus) *env {
	t.Helper()
	e := &env{t: t, pool: platformtest.NewDB(t, migrations.FS), clock: time.Date(2026, 11, 18, 10, 0, 0, 0, msk),
		logs: &bytes.Buffer{}}
	if _, err := e.pool.Exec(context.Background(), catalogSQL); err != nil {
		t.Fatal(err)
	}
	srv := app.New(e.pool, slog.New(slog.NewJSONHandler(e.logs, nil)), func() time.Time { return e.clock }, bus,
		fakeAcademic(t), "https://lk.example")
	e.pub, _ = srv.Handlers()
	return e
}

// fakeAcademic — поддельный внутренний API academic (internal/academic.yaml, getStudentCard).
func fakeAcademic(t *testing.T) *academic.ClientWithResponses {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		for _, c := range cards {
			if r.Method == http.MethodGet && r.URL.Path == "/internal/students/"+c.Id.String() {
				_ = json.NewEncoder(w).Encode(c)
				return
			}
		}
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte(`{"code":"not_found","message":"Не найдено"}`))
	}))
	t.Cleanup(srv.Close)
	c, err := academic.NewClientWithResponses(srv.URL)
	if err != nil {
		t.Fatal(err)
	}
	return c
}

// do — JSON-запрос от имени id (nil — без входа).
func (e *env) do(method, path string, id *platform.Identity, body any) *httptest.ResponseRecorder {
	e.t.Helper()
	var rd io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rd = bytes.NewReader(b)
	}
	r := httptest.NewRequest(method, path, rd)
	r.Header.Set("Content-Type", "application/json")
	if id != nil {
		platformtest.As(r, *id)
	}
	w := httptest.NewRecorder()
	e.pub.ServeHTTP(w, r)
	return w
}

func (e *env) upload(path string, id platform.Identity, name string, data []byte, isResult bool) *httptest.ResponseRecorder {
	e.t.Helper()
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	fw, _ := mw.CreateFormFile("file", name)
	_, _ = fw.Write(data)
	if isResult {
		_ = mw.WriteField("is_result", "true")
	}
	_ = mw.Close()
	r := httptest.NewRequest(http.MethodPost, path, &buf)
	r.Header.Set("Content-Type", mw.FormDataContentType())
	platformtest.As(r, id)
	w := httptest.NewRecorder()
	e.pub.ServeHTTP(w, r)
	return w
}

func (e *env) create(id platform.Identity, service string, fields map[string]string) api.Application {
	e.t.Helper()
	w := e.do(http.MethodPost, "/me/applications", &id, api.CreateApplicationRequest{ServiceTypeId: service, Fields: fields})
	expect(e.t, w, http.StatusCreated)
	return decode[api.Application](e.t, w)
}

// forceStatus — подготовка состояния напрямую в БД (минуя правила переходов).
func (e *env) forceStatus(id uuid.UUID, status string) {
	e.t.Helper()
	if _, err := e.pool.Exec(context.Background(), "UPDATE applications SET status = $1 WHERE id = $2", status, id); err != nil {
		e.t.Fatal(err)
	}
}

func expect(t *testing.T, w *httptest.ResponseRecorder, code int) {
	t.Helper()
	if w.Code != code {
		t.Fatalf("код %d, ожидался %d; тело: %s", w.Code, code, w.Body)
	}
}

func expectError(t *testing.T, w *httptest.ResponseRecorder, code int, errCode string) platformtest.ErrorBody {
	t.Helper()
	expect(t, w, code)
	b := platformtest.DecodeError(t, w.Body.Bytes())
	if b.Code != errCode {
		t.Fatalf("code %q, ожидался %q; тело: %s", b.Code, errCode, w.Body)
	}
	return b
}

func decode[T any](t *testing.T, w *httptest.ResponseRecorder) T {
	t.Helper()
	var v T
	if err := json.Unmarshal(w.Body.Bytes(), &v); err != nil {
		t.Fatalf("ответ не JSON: %v; тело: %s", err, w.Body)
	}
	return v
}

func p(id platform.Identity) *platform.Identity { return &id }

func pngBytes() []byte {
	// Заголовок PNG достаточен для определения типа по содержимому.
	return append([]byte("\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR"), bytes.Repeat([]byte{0}, 64)...)
}

// ---------- Подача заявки ----------

func TestCreateDocumentApplication(t *testing.T) {
	e := setup(t, nil)
	a := e.create(asA, "academic-leave", map[string]string{"reason": "Другое", "start_date": "2026-12-01", "details": " Семья "})

	if a.Number != "000001" || a.Status != api.Submitted || a.ServiceType.Id != "academic-leave" {
		t.Fatalf("неверная заявка: %+v", a)
	}
	if wantDue := e.clock.AddDate(0, 0, 10); a.DueAt == nil || !a.DueAt.Equal(wantDue) {
		t.Fatalf("due_at = %v, ожидалось %v", a.DueAt, wantDue)
	}
	if a.Overdue == nil || *a.Overdue {
		t.Fatalf("overdue = %v", a.Overdue)
	}
	if len(a.StatusHistory) != 1 || a.StatusHistory[0].Status != api.Submitted || a.StatusHistory[0].ByRole != api.Student {
		t.Fatalf("история: %+v", a.StatusHistory)
	}
	// Поля — в порядке формы, с подписями, без пробелов по краям.
	got := fmt.Sprint(a.Fields)
	if want := "[{reason Причина Другое} {start_date С какой даты 2026-12-01} {details Подробности Семья}]"; got != want {
		t.Fatalf("поля %s, ожидалось %s", got, want)
	}
	if a.Certificate != nil {
		t.Fatal("у обычной заявки не должно быть справки")
	}
	if !strings.HasSuffix(a.CreatedAt.Format(time.RFC3339), "+03:00") {
		t.Fatalf("время не по Москве: %s", a.CreatedAt.Format(time.RFC3339))
	}

	// Слепок и факультет заявки — из academic: заявку видит деканат ФМО, а не МЭО.
	w := e.do(http.MethodGet, "/staff/applications/"+a.Id.String(), &asStaffMO, nil)
	expect(t, w, http.StatusOK)
	sa := decode[api.StaffApplication](t, w)
	if sa.Student.FullName != "Лебедева Анна Викторовна" || sa.Student.GroupName != "МО-24-03" || sa.Student.Id != studentA {
		t.Fatalf("слепок: %+v", sa.Student)
	}
	expectError(t, e.do(http.MethodGet, "/staff/applications/"+a.Id.String(), &asStaffMEO, nil), http.StatusNotFound, "not_found")

	if b := e.create(asB, "transcript", nil); b.Number != "000002" {
		t.Fatalf("номер второй заявки %s", b.Number)
	}
}

func TestCreateValidation(t *testing.T) {
	e := setup(t, nil)
	cases := []struct {
		name    string
		body    api.CreateApplicationRequest
		errKeys []string
	}{
		{"обязательное поле", api.CreateApplicationRequest{ServiceTypeId: "academic-leave",
			Fields: map[string]string{"start_date": "2026-12-01"}}, []string{"reason"}},
		{"неверный option", api.CreateApplicationRequest{ServiceTypeId: "academic-leave",
			Fields: map[string]string{"reason": "Нет такого", "start_date": "2026-12-01"}}, []string{"reason"}},
		{"неверная дата", api.CreateApplicationRequest{ServiceTypeId: "academic-leave",
			Fields: map[string]string{"reason": "Другое", "start_date": "1 декабря"}}, []string{"start_date"}},
		{"превышение длины", api.CreateApplicationRequest{ServiceTypeId: "academic-leave",
			Fields: map[string]string{"reason": "Другое", "start_date": "2026-12-01", "details": strings.Repeat("ж", 21)}}, []string{"details"}},
		{"длинный комментарий", api.CreateApplicationRequest{ServiceTypeId: "transcript",
			Comment: ptr(strings.Repeat("к", 2001))}, []string{"comment"}},
		{"неизвестная услуга", api.CreateApplicationRequest{ServiceTypeId: "no-such"}, []string{"service_type_id"}},
		{"снятая услуга", api.CreateApplicationRequest{ServiceTypeId: "old-service"}, []string{"service_type_id"}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			b := expectError(t, e.do(http.MethodPost, "/me/applications", &asA, c.body), http.StatusBadRequest, "validation_failed")
			if len(b.Details.Fields) != len(c.errKeys) {
				t.Fatalf("ошибки %v, ожидались ключи %v", b.Details.Fields, c.errKeys)
			}
			for _, k := range c.errKeys {
				if b.Details.Fields[k] == "" {
					t.Fatalf("нет ошибки по %q: %v", k, b.Details.Fields)
				}
			}
		})
	}
	var n int
	_ = e.pool.QueryRow(context.Background(), "SELECT count(*) FROM applications").Scan(&n)
	if n != 0 {
		t.Fatalf("после ошибок валидации создано заявок: %d", n)
	}
}

func ptr[T any](v T) *T { return &v }

// ---------- Права доступа ----------

func TestRoles(t *testing.T) {
	e := setup(t, nil)
	for _, path := range []string{"/staff/applications", "/staff/stats", "/staff/applications/" + uuid.NewString()} {
		expectError(t, e.do(http.MethodGet, path, &asA, nil), http.StatusForbidden, "forbidden")
		expectError(t, e.do(http.MethodGet, path, nil, nil), http.StatusUnauthorized, "unauthenticated")
	}
	expectError(t, e.do(http.MethodPost, "/staff/applications/"+uuid.NewString()+"/status", &asA,
		api.StatusChangeRequest{Status: api.InProgress}), http.StatusForbidden, "forbidden")
	expectError(t, e.do(http.MethodGet, "/me/applications", &asStaffMO, nil), http.StatusForbidden, "forbidden")
	expectError(t, e.do(http.MethodPost, "/me/applications", &asAdmin, api.CreateApplicationRequest{ServiceTypeId: "transcript"}),
		http.StatusForbidden, "forbidden")
	expectError(t, e.do(http.MethodGet, "/service-types", nil, nil), http.StatusUnauthorized, "unauthenticated")
	for _, id := range []platform.Identity{asA, asStaffMO, asAdmin} {
		expect(t, e.do(http.MethodGet, "/service-types", &id, nil), http.StatusOK)
	}
}

// Студент Б не видит заявку студента А ни списком, ни по ID, ни через вложения и PDF (IDOR → 404).
func TestStudentCannotSeeOthersApplication(t *testing.T) {
	e := setup(t, nil)
	a := e.create(asA, "academic-leave", leaveFields)
	cert := e.create(asA, "study-certificate", map[string]string{"purpose": "По месту требования"})
	w := e.upload("/me/applications/"+a.Id.String()+"/attachments", asA, "scan.png", pngBytes(), false)
	expect(t, w, http.StatusCreated)
	att := decode[api.Attachment](t, w)
	own := e.create(asB, "transcript", nil)

	list := decode[api.ApplicationList](t, e.do(http.MethodGet, "/me/applications", &asB, nil))
	if list.Total != 1 || len(list.Items) != 1 || list.Items[0].Id != own.Id {
		t.Fatalf("в списке Б чужие заявки: %+v", list)
	}

	base := "/me/applications/" + a.Id.String()
	for name, w := range map[string]*httptest.ResponseRecorder{
		"карточка":         e.do(http.MethodGet, base, &asB, nil),
		"отзыв":            e.do(http.MethodPost, base+"/cancel", &asB, nil),
		"сообщение":        e.do(http.MethodPost, base+"/messages", &asB, api.MessageRequest{Text: "Привет"}),
		"загрузка":         e.upload(base+"/attachments", asB, "x.png", pngBytes(), false),
		"скачивание":       e.do(http.MethodGet, base+"/attachments/"+att.Id.String(), &asB, nil),
		"вложение в своей": e.do(http.MethodGet, "/me/applications/"+own.Id.String()+"/attachments/"+att.Id.String(), &asB, nil),
		"PDF":              e.do(http.MethodGet, "/me/applications/"+cert.Id.String()+"/certificate.pdf", &asB, nil),
		"несуществующая":   e.do(http.MethodGet, "/me/applications/"+uuid.NewString(), &asB, nil),
	} {
		t.Run(name, func(t *testing.T) { expectError(t, w, http.StatusNotFound, "not_found") })
	}

	// Ничего не изменилось: у А заявка по-прежнему подана, одно вложение, нет сообщений.
	got := decode[api.Application](t, e.do(http.MethodGet, base, &asA, nil))
	if got.Status != api.Submitted || len(got.Attachments) != 1 || len(got.Messages) != 0 {
		t.Fatalf("чужие действия изменили заявку: %+v", got)
	}
	expect(t, e.do(http.MethodGet, base+"/attachments/"+att.Id.String(), &asA, nil), http.StatusOK)
}

// Сотрудник МЭО не видит заявки ФМО; администратор видит всё и фильтрует по факультету.
func TestStaffFacultyScope(t *testing.T) {
	e := setup(t, nil)
	mo := e.create(asA, "academic-leave", leaveFields)
	w := e.upload("/me/applications/"+mo.Id.String()+"/attachments", asA, "scan.png", pngBytes(), false)
	att := decode[api.Attachment](t, w)
	meo := e.create(asB, "transcript", nil)

	base := "/staff/applications/" + mo.Id.String()
	for name, w := range map[string]*httptest.ResponseRecorder{
		"карточка":   e.do(http.MethodGet, base, &asStaffMEO, nil),
		"статус":     e.do(http.MethodPost, base+"/status", &asStaffMEO, api.StatusChangeRequest{Status: api.InProgress}),
		"сообщение":  e.do(http.MethodPost, base+"/messages", &asStaffMEO, api.MessageRequest{Text: "Ответ"}),
		"загрузка":   e.upload(base+"/attachments", asStaffMEO, "r.png", pngBytes(), true),
		"скачивание": e.do(http.MethodGet, base+"/attachments/"+att.Id.String(), &asStaffMEO, nil),
	} {
		t.Run(name, func(t *testing.T) { expectError(t, w, http.StatusNotFound, "not_found") })
	}

	ids := func(id platform.Identity, query string) []uuid.UUID {
		l := decode[api.StaffApplicationList](t, e.do(http.MethodGet, "/staff/applications"+query, &id, nil))
		out := []uuid.UUID{}
		for _, it := range l.Items {
			out = append(out, it.Id)
		}
		if l.Total != len(out) {
			t.Fatalf("total %d, элементов %d", l.Total, len(out))
		}
		return out
	}
	// staff: только свой факультет, параметр faculty_id игнорируется
	if got := ids(asStaffMEO, "?faculty_id="+facultyMO.String()); len(got) != 1 || got[0] != meo.Id {
		t.Fatalf("staff МЭО видит %v", got)
	}
	if got := ids(asStaffMO, ""); len(got) != 1 || got[0] != mo.Id {
		t.Fatalf("staff ФМО видит %v", got)
	}
	if got := ids(asAdmin, ""); len(got) != 2 {
		t.Fatalf("admin видит %v", got)
	}
	if got := ids(asAdmin, "?faculty_id="+facultyMEO.String()); len(got) != 1 || got[0] != meo.Id {
		t.Fatalf("admin с фильтром МЭО видит %v", got)
	}
	expect(t, e.do(http.MethodGet, base, &asStaffMO, nil), http.StatusOK)
	expect(t, e.do(http.MethodGet, base, &asAdmin, nil), http.StatusOK)

	stats := decode[api.StaffStats](t, e.do(http.MethodGet, "/staff/stats", &asStaffMEO, nil))
	if stats.Submitted != 1 {
		t.Fatalf("статистика МЭО учитывает чужой факультет: %+v", stats)
	}
	if stats := decode[api.StaffStats](t, e.do(http.MethodGet, "/staff/stats", &asAdmin, nil)); stats.Submitted != 2 {
		t.Fatalf("статистика admin: %+v", stats)
	}
}

// ---------- Статусы ----------

// Все пары статусов через API сотрудника: разрешённые по Б5 → 200, остальные → 409.
func TestStaffStatusChangeAllPairs(t *testing.T) {
	e := setup(t, nil)
	staffAllowed := map[api.ApplicationStatus][]api.ApplicationStatus{
		api.Submitted:  {api.InProgress, api.Rejected},
		api.InProgress: {api.NeedsInfo, api.Ready, api.Rejected},
		api.NeedsInfo:  {api.InProgress, api.Rejected},
	}
	all := []api.ApplicationStatus{api.Submitted, api.InProgress, api.NeedsInfo, api.Ready, api.Rejected, api.Cancelled}
	for _, from := range all {
		for _, to := range all {
			t.Run(fmt.Sprintf("%s→%s", from, to), func(t *testing.T) {
				a := e.create(asA, "academic-leave", leaveFields)
				e.forceStatus(a.Id, string(from))
				w := e.do(http.MethodPost, "/staff/applications/"+a.Id.String()+"/status", &asStaffMO,
					api.StatusChangeRequest{Status: to, Comment: ptr("Комментарий")})
				allowed := false
				for _, s := range staffAllowed[from] {
					allowed = allowed || s == to
				}
				if !allowed {
					expectError(t, w, http.StatusConflict, "invalid_transition")
					return
				}
				expect(t, w, http.StatusOK)
				got := decode[api.StaffApplication](t, w)
				last := got.StatusHistory[len(got.StatusHistory)-1]
				if got.Status != to || last.Status != to || last.ByRole != api.Staff || *last.Comment != "Комментарий" {
					t.Fatalf("после перехода: %+v", got)
				}
				terminal := to == api.Ready || to == api.Rejected || to == api.Cancelled
				if terminal != (got.DueAt == nil) {
					t.Fatalf("due_at = %v для %s", got.DueAt, to)
				}
			})
		}
	}
}

func TestStatusCommentRequiredAndAllowedTransitions(t *testing.T) {
	e := setup(t, nil)
	a := e.create(asA, "academic-leave", leaveFields)
	url := "/staff/applications/" + a.Id.String() + "/status"

	sa := decode[api.StaffApplication](t, e.do(http.MethodGet, "/staff/applications/"+a.Id.String(), &asStaffMO, nil))
	if fmt.Sprint(sa.AllowedTransitions) != "[in_progress rejected]" {
		t.Fatalf("allowed_transitions = %v", sa.AllowedTransitions)
	}
	b := expectError(t, e.do(http.MethodPost, url, &asStaffMO, api.StatusChangeRequest{Status: api.Rejected, Comment: ptr("  ")}),
		http.StatusBadRequest, "validation_failed")
	if b.Details.Fields["comment"] == "" {
		t.Fatalf("нет ошибки по comment: %+v", b)
	}
	expect(t, e.do(http.MethodPost, url, &asStaffMO, api.StatusChangeRequest{Status: api.InProgress}), http.StatusOK)
	expectError(t, e.do(http.MethodPost, url, &asStaffMO, api.StatusChangeRequest{Status: api.NeedsInfo}),
		http.StatusBadRequest, "validation_failed")
	w := e.do(http.MethodPost, url, &asAdmin, api.StatusChangeRequest{Status: api.NeedsInfo, Comment: ptr("Приложите справку")})
	expect(t, w, http.StatusOK)
	if got := decode[api.StaffApplication](t, w); fmt.Sprint(got.AllowedTransitions) != "[in_progress rejected]" {
		t.Fatalf("allowed_transitions в needs_info = %v", got.AllowedTransitions)
	}
}

func TestStudentCancel(t *testing.T) {
	e := setup(t, nil)
	a := e.create(asA, "academic-leave", leaveFields)
	w := e.do(http.MethodPost, "/me/applications/"+a.Id.String()+"/cancel", &asA, nil)
	expect(t, w, http.StatusOK)
	got := decode[api.Application](t, w)
	if got.Status != api.Cancelled || got.DueAt != nil || len(got.StatusHistory) != 2 || got.StatusHistory[1].ByRole != api.Student {
		t.Fatalf("после отзыва: %+v", got)
	}
	expectError(t, e.do(http.MethodPost, "/me/applications/"+a.Id.String()+"/cancel", &asA, nil), http.StatusConflict, "invalid_transition")

	b := e.create(asA, "academic-leave", leaveFields)
	e.forceStatus(b.Id, "in_progress")
	expectError(t, e.do(http.MethodPost, "/me/applications/"+b.Id.String()+"/cancel", &asA, nil), http.StatusConflict, "invalid_transition")
}

// ---------- Переписка и события ----------

type collected struct {
	status chan events.ApplicationStatusChanged
	msg    chan events.ApplicationMessageAdded
}

func subscribe(t *testing.T, bus *events.Bus) collected {
	c := collected{make(chan events.ApplicationStatusChanged, 20), make(chan events.ApplicationMessageAdded, 20)}
	ctx := context.Background()
	stop1, err := events.Subscribe(ctx, bus, "test", func(_ context.Context, e events.Envelope[events.ApplicationStatusChanged]) error {
		c.status <- e.Data
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	stop2, err := events.Subscribe(ctx, bus, "test", func(_ context.Context, e events.Envelope[events.ApplicationMessageAdded]) error {
		c.msg <- e.Data
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { stop1(); stop2() })
	return c
}

func next[T any](t *testing.T, ch chan T) T {
	t.Helper()
	select {
	case v := <-ch:
		return v
	case <-time.After(5 * time.Second):
		t.Fatal("событие не пришло")
	}
	var zero T
	return zero
}

// Оценка ответа деканата: только своя завершённая заявка не мгновенной услуги; видна сотруднику и в счётчиках.
func TestFeedback(t *testing.T) {
	e := setup(t, nil)
	a := e.create(asA, "transcript", nil)
	path := "/me/applications/" + a.Id.String() + "/feedback"
	helpful := func(v bool, comment *string) api.FeedbackRequest {
		return api.FeedbackRequest{Helpful: v, Comment: comment}
	}

	expectError(t, e.do(http.MethodPut, path, &asA, helpful(true, nil)), http.StatusConflict, "invalid_transition") // ещё не готова
	e.forceStatus(a.Id, string(api.Ready))
	expectError(t, e.do(http.MethodPut, path, &asB, helpful(true, nil)), http.StatusNotFound, "not_found") // чужая
	expectError(t, e.do(http.MethodPut, path, &asStaffMO, helpful(true, nil)), http.StatusForbidden, "forbidden")
	long := strings.Repeat("я", 1001)
	expectError(t, e.do(http.MethodPut, path, &asA, helpful(false, &long)), http.StatusBadRequest, "validation_failed")

	got := decode[api.Application](t, e.do(http.MethodPut, path, &asA, helpful(true, nil)))
	if got.Feedback == nil || !got.Feedback.Helpful || got.Feedback.Comment != nil {
		t.Fatalf("оценка не сохранилась: %+v", got.Feedback)
	}
	// Повтор заменяет оценку; комментарий обрезается.
	comment := "  Долго ждал ответа  "
	got = decode[api.Application](t, e.do(http.MethodPut, path, &asA, helpful(false, &comment)))
	if got.Feedback.Helpful || got.Feedback.Comment == nil || *got.Feedback.Comment != "Долго ждал ответа" {
		t.Fatalf("оценка не заменилась: %+v", got.Feedback)
	}

	staff := decode[api.StaffApplication](t, e.do(http.MethodGet, "/staff/applications/"+a.Id.String(), &asStaffMO, nil))
	if staff.Feedback == nil || staff.Feedback.Helpful {
		t.Fatalf("сотрудник не видит оценку: %+v", staff.Feedback)
	}
	stats := decode[api.StaffStats](t, e.do(http.MethodGet, "/staff/stats", &asStaffMO, nil))
	if stats.FeedbackTotal != 1 || stats.FeedbackHelpful != 0 {
		t.Fatalf("счётчики оценок: %+v", stats)
	}
	if stats := decode[api.StaffStats](t, e.do(http.MethodGet, "/staff/stats", &asStaffMEO, nil)); stats.FeedbackTotal != 0 {
		t.Fatalf("оценка ФМО попала в счётчики МЭО: %+v", stats)
	}

	// У мгновенной справки оценки нет: её выдаёт система, а не деканат.
	cert := e.create(asA, "study-certificate", map[string]string{"purpose": "По месту требования"})
	expectError(t, e.do(http.MethodPut, "/me/applications/"+cert.Id.String()+"/feedback", &asA, helpful(true, nil)),
		http.StatusConflict, "invalid_transition")
}

func TestMessagesStatusesAndEvents(t *testing.T) {
	bus, err := events.Connect(context.Background(), platformtest.NewNATS(t), slog.New(slog.NewTextHandler(io.Discard, nil)))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(bus.Close)
	ev := subscribe(t, bus)
	e := setup(t, bus)

	a := e.create(asA, "academic-leave", leaveFields)
	created := next(t, ev.status)
	if created.OldStatus != nil || created.NewStatus != "submitted" || created.Number != "000001" ||
		created.StudentID != studentA || created.FacultyID != facultyMO || created.ServiceTypeID != "academic-leave" ||
		created.ServiceTitle != "Академический отпуск" {
		t.Fatalf("событие подачи: %+v", created)
	}

	url := "/staff/applications/" + a.Id.String()
	e.clock = e.clock.Add(time.Minute)
	expect(t, e.do(http.MethodPost, url+"/status", &asStaffMO, api.StatusChangeRequest{Status: api.InProgress}), http.StatusOK)
	if ch := next(t, ev.status); *ch.OldStatus != "submitted" || ch.NewStatus != "in_progress" || ch.Comment != nil {
		t.Fatalf("событие in_progress: %+v", ch)
	}
	e.clock = e.clock.Add(time.Minute)
	expect(t, e.do(http.MethodPost, url+"/status", &asStaffMO,
		api.StatusChangeRequest{Status: api.NeedsInfo, Comment: ptr("Приложите справку о составе семьи")}), http.StatusOK)
	if ch := next(t, ev.status); ch.NewStatus != "needs_info" || ch.Comment == nil || *ch.Comment != "Приложите справку о составе семьи" {
		t.Fatalf("событие needs_info: %+v", ch)
	}

	// Сообщение сотрудника: подпись «Деканат ФМО», событие message_added.
	e.clock = e.clock.Add(time.Minute)
	w := e.do(http.MethodPost, url+"/messages", &asStaffMO, api.MessageRequest{Text: "  Ждём документ до пятницы  "})
	expect(t, w, http.StatusCreated)
	if m := decode[api.Message](t, w); m.AuthorLabel != "Деканат ФМО" || m.AuthorRole != api.MessageAuthorRoleStaff || m.Text != "Ждём документ до пятницы" {
		t.Fatalf("сообщение сотрудника: %+v", m)
	}
	if m := next(t, ev.msg); m.AuthorRole != "staff" || m.AuthorLabel != "Деканат ФМО" || m.StudentID != studentA || m.Number != "000001" {
		t.Fatalf("событие сообщения сотрудника: %+v", m)
	}
	answered := decode[api.ApplicationList](t, e.do(http.MethodGet, "/me/applications?answered=true", &asA, nil))
	if answered.Total != 1 || *answered.Items[0].LastMessageFrom != api.ApplicationSummaryLastMessageFromStaff {
		t.Fatalf("answered=true: %+v", answered)
	}

	// Сообщение студента в needs_info возвращает заявку в работу.
	e.clock = e.clock.Add(time.Minute)
	w = e.do(http.MethodPost, "/me/applications/"+a.Id.String()+"/messages", &asA, api.MessageRequest{Text: "Справку приложила"})
	expect(t, w, http.StatusCreated)
	if m := decode[api.Message](t, w); m.AuthorLabel != "Лебедева А. В." || m.AuthorRole != api.MessageAuthorRoleStudent {
		t.Fatalf("сообщение студента: %+v", m)
	}
	if m := next(t, ev.msg); m.AuthorRole != "student" {
		t.Fatalf("событие сообщения студента: %+v", m)
	}
	if ch := next(t, ev.status); *ch.OldStatus != "needs_info" || ch.NewStatus != "in_progress" {
		t.Fatalf("событие возврата в работу: %+v", ch)
	}
	got := decode[api.Application](t, e.do(http.MethodGet, "/me/applications/"+a.Id.String(), &asA, nil))
	last := got.StatusHistory[len(got.StatusHistory)-1]
	if got.Status != api.InProgress || last.ByRole != api.Student || len(got.Messages) != 2 ||
		got.Messages[0].AuthorRole != api.MessageAuthorRoleStaff || *got.LastMessageFrom != api.ApplicationLastMessageFromStudent {
		t.Fatalf("после ответа студента: %+v", got)
	}

	// Администратор подписывается «Администрация».
	w = e.do(http.MethodPost, url+"/messages", &asAdmin, api.MessageRequest{Text: "Проверено"})
	expect(t, w, http.StatusCreated)
	if m := decode[api.Message](t, w); m.AuthorLabel != "Администрация" {
		t.Fatalf("подпись администратора: %q", m.AuthorLabel)
	}
	next(t, ev.msg)

	// Пустое сообщение — 400; в rejected и cancelled писать нельзя — 409.
	expectError(t, e.do(http.MethodPost, url+"/messages", &asStaffMO, api.MessageRequest{Text: "   "}), http.StatusBadRequest, "validation_failed")
	expect(t, e.do(http.MethodPost, url+"/status", &asStaffMO, api.StatusChangeRequest{Status: api.Rejected, Comment: ptr("Нет оснований")}), http.StatusOK)
	next(t, ev.status)
	expectError(t, e.do(http.MethodPost, url+"/messages", &asStaffMO, api.MessageRequest{Text: "Ещё"}), http.StatusConflict, "invalid_transition")
	expectError(t, e.do(http.MethodPost, "/me/applications/"+a.Id.String()+"/messages", &asA, api.MessageRequest{Text: "Почему?"}),
		http.StatusConflict, "invalid_transition")

	// В логах — только ID и типы событий: ни ФИО, ни текстов сообщений.
	for _, secret := range []string{"Лебедева", "Ждём документ", "Справку приложила", "Приложите справку"} {
		if strings.Contains(e.logs.String(), secret) {
			t.Fatalf("в логах персональные данные или текст: %q", secret)
		}
	}
}

// ---------- Вложения ----------

func TestAttachments(t *testing.T) {
	e := setup(t, nil)
	a := e.create(asA, "academic-leave", leaveFields)
	url := "/me/applications/" + a.Id.String() + "/attachments"

	expectError(t, e.upload(url, asA, "big.pdf", append([]byte("%PDF-1.4\n"), make([]byte, 6<<20)...), false),
		http.StatusRequestEntityTooLarge, "file_too_large")
	exe := append([]byte("MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff"), make([]byte, 128)...)
	expectError(t, e.upload(url, asA, "spravka.pdf", exe, false), http.StatusUnsupportedMediaType, "unsupported_file_type")
	expectError(t, e.upload(url, asA, "empty.pdf", nil, false), http.StatusUnsupportedMediaType, "unsupported_file_type")

	// Ровно 5 МБ — можно; студенту is_result не даётся.
	exact := append([]byte("%PDF-1.4\n"), make([]byte, app.MaxFileSize-9)...)
	w := e.upload(url, asA, `..\..\Заявление.pdf`, exact, true)
	expect(t, w, http.StatusCreated)
	att := decode[api.Attachment](t, w)
	if att.ContentType != api.Applicationpdf || att.Size != app.MaxFileSize || att.IsResult ||
		att.UploadedByRole != api.AttachmentUploadedByRoleStudent || att.FileName != "Заявление.pdf" {
		t.Fatalf("вложение: %+v", att)
	}

	w = e.do(http.MethodGet, url+"/"+att.Id.String(), &asA, nil)
	expect(t, w, http.StatusOK)
	if cd := w.Header().Get("Content-Disposition"); !strings.HasPrefix(cd, "attachment;") || !strings.Contains(cd, "filename*=utf-8''") {
		t.Fatalf("Content-Disposition: %q", cd)
	}
	if w.Header().Get("X-Content-Type-Options") != "nosniff" || w.Header().Get("Content-Type") != "application/octet-stream" {
		t.Fatalf("заголовки: %v", w.Header())
	}
	if !bytes.Equal(w.Body.Bytes(), exact) {
		t.Fatal("содержимое файла отличается")
	}

	// Сотрудник прикладывает результат.
	w = e.upload("/staff/applications/"+a.Id.String()+"/attachments", asStaffMO, "result.png", pngBytes(), true)
	expect(t, w, http.StatusCreated)
	if r := decode[api.Attachment](t, w); !r.IsResult || r.ContentType != api.Imagepng || r.UploadedByRole != api.AttachmentUploadedByRoleStaff {
		t.Fatalf("вложение сотрудника: %+v", r)
	}
	expect(t, e.do(http.MethodGet, url+"/"+decode[api.Attachment](t, w).Id.String(), &asA, nil), http.StatusOK)

	// Студенту — только в submitted и needs_info и только если услуга разрешает.
	e.forceStatus(a.Id, "in_progress")
	expectError(t, e.upload(url, asA, "x.png", pngBytes(), false), http.StatusConflict, "invalid_transition")
	e.forceStatus(a.Id, "needs_info")
	expect(t, e.upload(url, asA, "x.png", pngBytes(), false), http.StatusCreated)
	// Файл в ответ на «Нужны уточнения» возвращает заявку в работу, как и сообщение.
	if got := decode[api.Application](t, e.do(http.MethodGet, "/me/applications/"+a.Id.String(), &asA, nil)); got.Status != api.InProgress {
		t.Fatalf("после файла в needs_info статус %s, ожидался in_progress", got.Status)
	}
	tr := e.create(asA, "transcript", nil)
	expectError(t, e.upload("/me/applications/"+tr.Id.String()+"/attachments", asA, "x.png", pngBytes(), false),
		http.StatusConflict, "invalid_transition")
	e.forceStatus(a.Id, "cancelled")
	expectError(t, e.upload("/staff/applications/"+a.Id.String()+"/attachments", asStaffMO, "x.png", pngBytes(), false),
		http.StatusConflict, "invalid_transition")

	got := decode[api.Application](t, e.do(http.MethodGet, "/me/applications/"+a.Id.String(), &asA, nil))
	if len(got.Attachments) != 3 {
		t.Fatalf("вложений %d, ожидалось 3", len(got.Attachments))
	}
}

// ---------- Справка ----------

var codeRe = regexp.MustCompile(`^[A-Z2-7]{10}$`)

func TestInstantCertificate(t *testing.T) {
	e := setup(t, nil)
	a := e.create(asA, "study-certificate", map[string]string{"purpose": "Для работодателя", "destination": "ООО «Ромашка»"})
	if a.Status != api.Ready || a.DueAt != nil || len(a.StatusHistory) != 1 || a.StatusHistory[0].ByRole != api.System {
		t.Fatalf("мгновенная справка: %+v", a)
	}
	c := a.Certificate
	if c == nil || !codeRe.MatchString(c.Code) || c.VerifyUrl != "/verify/"+c.Code || c.ValidUntil.String() != "2026-12-18" {
		t.Fatalf("справка: %+v", c)
	}
	// Справки студентам не отзываются.
	expectError(t, e.do(http.MethodPost, "/me/applications/"+a.Id.String()+"/cancel", &asA, nil), http.StatusConflict, "invalid_transition")

	w := e.do(http.MethodGet, "/me/applications/"+a.Id.String()+"/certificate.pdf", &asA, nil)
	expect(t, w, http.StatusOK)
	pdf := w.Body.Bytes()
	if w.Header().Get("Content-Type") != "application/pdf" || !strings.HasPrefix(w.Header().Get("Content-Disposition"), "attachment;") {
		t.Fatalf("заголовки PDF: %v", w.Header())
	}
	if !bytes.HasPrefix(pdf, []byte("%PDF-")) || !bytes.Contains(pdf[len(pdf)-16:], []byte("%%EOF")) {
		t.Fatal("ответ — не PDF")
	}
	// Код — в метаданных; шрифт с кириллицей встроен, у текста есть ToUnicode (копируется и ищется).
	for _, part := range []string{"/Keywords (" + c.Code + ")", "/FontFile2", "/ToUnicode"} {
		if !bytes.Contains(pdf, []byte(part)) {
			t.Errorf("в PDF нет %q", part)
		}
	}
	if out := os.Getenv("CERT_PDF_OUT"); out != "" { // для ручной проверки: pdftotext, скриншот
		_ = os.WriteFile(out, pdf, 0o644)
	}

	// Обычная заявка — без PDF.
	doc := e.create(asA, "academic-leave", leaveFields)
	expectError(t, e.do(http.MethodGet, "/me/applications/"+doc.Id.String()+"/certificate.pdf", &asA, nil), http.StatusNotFound, "not_found")

	// Проверка по коду — без входа, минимум данных.
	w = e.do(http.MethodGet, "/public/certificates/"+c.Code, nil, nil)
	expect(t, w, http.StatusOK)
	v := decode[api.CertificateVerification](t, w)
	if !v.Valid || v.Holder != "Лебедева А. В." || v.FacultyShort != "ФМО" || v.Title != "Справка с места учёбы" ||
		v.ValidUntil.String() != "2026-12-18" {
		t.Fatalf("проверка: %+v", v)
	}
	if strings.Contains(w.Body.String(), "Анна") || strings.Contains(w.Body.String(), "МО-24-03") {
		t.Fatalf("в проверке лишние данные: %s", w.Body)
	}
	expectError(t, e.do(http.MethodGet, "/public/certificates/AAAAAAAAAA", nil, nil), http.StatusNotFound, "not_found")
	expectError(t, e.do(http.MethodGet, "/public/certificates/abc", nil, nil), http.StatusNotFound, "not_found")

	e.clock = time.Date(2026, 12, 18, 23, 59, 0, 0, msk) // последний день действия
	if v := decode[api.CertificateVerification](t, e.do(http.MethodGet, "/public/certificates/"+c.Code, nil, nil)); !v.Valid {
		t.Fatal("в последний день справка должна быть действительна")
	}
	e.clock = e.clock.Add(2 * time.Minute)
	if v := decode[api.CertificateVerification](t, e.do(http.MethodGet, "/public/certificates/"+c.Code, nil, nil)); v.Valid {
		t.Fatal("просроченная справка должна быть valid=false")
	}
}

func TestVerifyRateLimit(t *testing.T) {
	e := setup(t, nil)
	get := func(ip string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(http.MethodGet, "/public/certificates/AAAAAAAAAA", nil)
		r.Header.Set("X-Forwarded-For", ip)
		w := httptest.NewRecorder()
		e.pub.ServeHTTP(w, r)
		return w
	}
	for range app.VerifyPerMinute {
		expect(t, get("10.0.0.1"), http.StatusNotFound)
	}
	w := get("10.0.0.1")
	expectError(t, w, http.StatusTooManyRequests, "too_many_attempts")
	if w.Header().Get("Retry-After") == "" {
		t.Fatal("нет Retry-After")
	}
	expect(t, get("10.0.0.2"), http.StatusNotFound)
	e.clock = e.clock.Add(time.Minute)
	expect(t, get("10.0.0.1"), http.StatusNotFound)
}

// ---------- Списки ----------

func TestStudentListFiltersAndPaging(t *testing.T) {
	e := setup(t, nil)
	first := e.create(asA, "academic-leave", leaveFields)
	e.clock = e.clock.Add(time.Hour)
	second := e.create(asA, "transcript", nil)
	e.clock = e.clock.Add(time.Hour)
	cert := e.create(asA, "study-certificate", map[string]string{"purpose": "Для работодателя"})

	l := decode[api.ApplicationList](t, e.do(http.MethodGet, "/me/applications", &asA, nil))
	if l.Total != 3 || l.Items[0].Id != cert.Id || l.Items[2].Id != first.Id {
		t.Fatalf("порядок по updated_at: %+v", l.Items)
	}
	l = decode[api.ApplicationList](t, e.do(http.MethodGet, "/me/applications?status=submitted&limit=1&offset=1", &asA, nil))
	if l.Total != 2 || len(l.Items) != 1 || l.Items[0].Id != first.Id {
		t.Fatalf("фильтр и страница: %+v", l)
	}
	l = decode[api.ApplicationList](t, e.do(http.MethodGet, "/me/applications?answered=true", &asA, nil))
	if l.Total != 1 || l.Items[0].Id != cert.Id {
		t.Fatalf("answered=true: %+v", l)
	}
	l = decode[api.ApplicationList](t, e.do(http.MethodGet, "/me/applications?answered=false", &asA, nil))
	if l.Total != 2 || l.Items[0].Id != second.Id {
		t.Fatalf("answered=false: %+v", l)
	}
	expectError(t, e.do(http.MethodGet, "/me/applications?limit=101", &asA, nil), http.StatusBadRequest, "validation_failed")
	expectError(t, e.do(http.MethodGet, "/me/applications?offset=-1", &asA, nil), http.StatusBadRequest, "validation_failed")
}

func TestStaffListOrderSearchAndStats(t *testing.T) {
	e := setup(t, nil)
	leave := e.create(asA, "academic-leave", leaveFields) // срок 10 дней
	e.clock = e.clock.Add(time.Hour)
	tr := e.create(asA, "transcript", nil) // срок 5 дней
	e.clock = e.clock.Add(time.Hour)
	inst := e.create(asA, "study-certificate", map[string]string{"purpose": "Для работодателя"}) // ready, без срока
	_ = e.create(asB, "transcript", nil)                                                         // МЭО

	order := func(query string) []uuid.UUID {
		l := decode[api.StaffApplicationList](t, e.do(http.MethodGet, "/staff/applications"+query, &asStaffMO, nil))
		out := []uuid.UUID{}
		for _, it := range l.Items {
			out = append(out, it.Id)
		}
		return out
	}
	if got := order(""); fmt.Sprint(got) != fmt.Sprint([]uuid.UUID{tr.Id, leave.Id, inst.Id}) {
		t.Fatalf("порядок по сроку: %v", got)
	}

	// Через 7 дней выписка просрочена, а отпуск ещё в сроке.
	e.clock = e.clock.AddDate(0, 0, 7)
	l := decode[api.StaffApplicationList](t, e.do(http.MethodGet, "/staff/applications?status=submitted", &asStaffMO, nil))
	if l.Total != 2 || l.Items[0].Id != tr.Id || !*l.Items[0].Overdue || *l.Items[1].Overdue {
		t.Fatalf("просроченные первыми: %+v", l.Items)
	}
	if l.Items[0].Student.ShortName != "Лебедева А. В." {
		t.Fatalf("слепок в списке: %+v", l.Items[0].Student)
	}

	if got := order("?q=" + "000002"); len(got) != 1 || got[0] != tr.Id {
		t.Fatalf("поиск по номеру: %v", got)
	}
	if got := order("?q=2"); len(got) != 1 || got[0] != tr.Id { // 000004 — заявка МЭО, её не видно
		t.Fatalf("поиск по части номера: %v", got)
	}
	if got := order("?q=" + "лебедева"); len(got) != 3 {
		t.Fatalf("поиск по ФИО: %v", got)
	}
	if got := order("?q=" + "%25"); len(got) != 0 { // % — не шаблон
		t.Fatalf("поиск по %%: %v", got)
	}
	if got := order("?q=" + "Соколов"); len(got) != 0 {
		t.Fatalf("поиск нашёл студента чужого факультета: %v", got)
	}
	if got := order("?service_type_id=transcript"); len(got) != 1 || got[0] != tr.Id {
		t.Fatalf("фильтр по услуге: %v", got)
	}
	expectError(t, e.do(http.MethodGet, "/staff/applications?q="+strings.Repeat("я", 101), &asStaffMO, nil),
		http.StatusBadRequest, "validation_failed")

	url := "/staff/applications/" + leave.Id.String() + "/status"
	expect(t, e.do(http.MethodPost, url, &asStaffMO, api.StatusChangeRequest{Status: api.InProgress}), http.StatusOK)
	expect(t, e.do(http.MethodPost, url, &asStaffMO, api.StatusChangeRequest{Status: api.Ready}), http.StatusOK)
	stats := decode[api.StaffStats](t, e.do(http.MethodGet, "/staff/stats", &asStaffMO, nil))
	want := api.StaffStats{Submitted: 1, InProgress: 0, NeedsInfo: 0, Overdue: 1, ReadyToday: 1}
	if stats != want {
		t.Fatalf("статистика %+v, ожидалось %+v", stats, want)
	}
	e.clock = e.clock.AddDate(0, 0, 1)
	if stats := decode[api.StaffStats](t, e.do(http.MethodGet, "/staff/stats", &asStaffMO, nil)); stats.ReadyToday != 0 {
		t.Fatalf("ready_today на следующий день: %+v", stats)
	}
}

// ---------- Тестовые данные ----------

// Seed применяется к пустой БД после миграций и согласован с контрактом.
func TestSeedApplies(t *testing.T) {
	pool := platformtest.NewDB(t, migrations.FS)
	ctx := context.Background()
	files, err := os.ReadDir("../../seed")
	if err != nil {
		t.Fatal(err)
	}
	for _, f := range files {
		sql, err := os.ReadFile("../../seed/" + f.Name())
		if err != nil {
			t.Fatal(err)
		}
		if _, err := pool.Exec(ctx, string(sql)); err != nil {
			t.Fatalf("%s: %v", f.Name(), err)
		}
	}
	// Время в seed отсчитывается от now() базы, поэтому и часы сервиса здесь настоящие.
	srv := app.New(pool, slog.New(slog.NewTextHandler(io.Discard, nil)), time.Now, nil, nil, "")
	pub, _ := srv.Handlers()
	get := func(path string, id platform.Identity) *httptest.ResponseRecorder {
		r := platformtest.As(httptest.NewRequest(http.MethodGet, path, nil), id)
		w := httptest.NewRecorder()
		pub.ServeHTTP(w, r)
		expect(t, w, http.StatusOK)
		return w
	}

	types := decode[[]api.ServiceType](t, get("/service-types", asA))
	if len(types) != 7 || types[0].Id != "study-certificate" {
		t.Fatalf("каталог: %d услуг, первая %v", len(types), types)
	}
	mo := decode[api.ApplicationList](t, get("/me/applications", asA))
	meo := decode[api.ApplicationList](t, get("/me/applications", asB))
	if mo.Total != 3 || meo.Total != 2 {
		t.Fatalf("заявок: student.mo %d, student.meo %d", mo.Total, meo.Total)
	}
	for _, set := range []struct {
		id    platform.Identity
		items []api.ApplicationSummary
	}{{asA, mo.Items}, {asB, meo.Items}} {
		for _, it := range set.items {
			d := decode[api.Application](t, get("/me/applications/"+it.Id.String(), set.id))
			if len(d.StatusHistory) == 0 || d.StatusHistory[len(d.StatusHistory)-1].Status != d.Status {
				t.Fatalf("%s: история не сходится со статусом", d.Number)
			}
			if d.ServiceType.Kind != api.InstantCertificate {
				continue
			}
			if d.Certificate == nil {
				t.Fatalf("%s: нет справки", d.Number)
			}
			if v := decode[api.CertificateVerification](t, get("/public/certificates/"+d.Certificate.Code, asA)); !v.Valid {
				t.Fatalf("справка из seed недействительна: %+v", v)
			}
		}
	}
	staff := decode[api.StaffApplicationList](t, get("/staff/applications", asStaffMEO))
	if staff.Total != 2 {
		t.Fatalf("деканат МЭО видит %d заявок", staff.Total)
	}
}
