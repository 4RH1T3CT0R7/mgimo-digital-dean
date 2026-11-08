package app_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"reflect"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/platform/platformtest"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/academic/internal/app"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/academic/internal/internalapi"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/academic/migrations"
)

var (
	f1      = uuid.MustParse("10000000-0000-4000-8000-000000000001")
	f2      = uuid.MustParse("10000000-0000-4000-8000-000000000002")
	g1      = uuid.MustParse("20000000-0000-4000-8000-000000000001")
	l1      = uuid.MustParse("20000000-0000-4000-8000-000000000002")
	l2      = uuid.MustParse("20000000-0000-4000-8000-000000000003")
	g2      = uuid.MustParse("20000000-0000-4000-8000-000000000004")
	g3      = uuid.MustParse("20000000-0000-4000-8000-000000000007")
	s1      = uuid.MustParse("30000000-0000-4000-8000-000000000001")
	s2      = uuid.MustParse("30000000-0000-4000-8000-000000000002")
	s3      = uuid.MustParse("30000000-0000-4000-8000-000000000003")
	unknown = uuid.MustParse("ffffffff-ffff-4fff-8fff-ffffffffffff")
)

// Фикстура теста независима от seed. S2 — тот же курс, другой факультет;
// S3 — тот же факультет, другой курс и общая с S1 языковая группа.
const fixture = `
INSERT INTO faculties (id, short_name, name) VALUES
('10000000-0000-4000-8000-000000000001', 'ФМО', 'Факультет международных отношений'),
('10000000-0000-4000-8000-000000000002', 'МЭО', 'Факультет международных экономических отношений');
INSERT INTO programs (id, faculty_id, code, name, level) VALUES
('11000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '41.03.05', 'Международные отношения', 'bachelor'),
('11000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', '38.03.01', 'Экономика', 'bachelor');
INSERT INTO groups (id, faculty_id, program_id, name, kind, course, language) VALUES
('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', 'МО-24-03', 'academic', 2, NULL),
('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', NULL, 'Англ-12', 'language', 2, 'Английский язык'),
('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', NULL, 'Фр-07', 'language', 2, 'Французский язык'),
('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000002', '11000000-0000-4000-8000-000000000002', 'МЭО-тест', 'academic', 2, NULL),
('20000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', 'МО-другой-курс', 'academic', 3, NULL);
INSERT INTO students (id, full_name, short_name, faculty_id, program_id, course, academic_group_id,
                      student_card_no, study_form, funding, study_level, enrollment_year, status) VALUES
('30000000-0000-4000-8000-000000000001', 'Лебедева Анна Викторовна', 'Лебедева А. В.',
 '10000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', 2,
 '20000000-0000-4000-8000-000000000001', '2401317', 'full_time', 'budget', 'bachelor', 2024, 'studying'),
('30000000-0000-4000-8000-000000000002', 'Соколов Максим Олегович', 'Соколов М. О.',
 '10000000-0000-4000-8000-000000000002', '11000000-0000-4000-8000-000000000002', 2,
 '20000000-0000-4000-8000-000000000004', '2302214', 'full_time', 'contract', 'bachelor', 2024, 'studying'),
('30000000-0000-4000-8000-000000000003', 'Северина Вера Павловна', 'Северина В. П.',
 '10000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', 3,
 '20000000-0000-4000-8000-000000000007', '2300003', 'full_time', 'budget', 'bachelor', 2023, 'studying');
INSERT INTO student_language_groups (student_id, group_id) VALUES
('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002'),
('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000003'),
('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000002');
`

type env struct {
	pool *pgxpool.Pool
	pub  http.Handler
	in   http.Handler
}

func setup(t *testing.T) *env {
	t.Helper()

	pool := platformtest.NewDB(t, migrations.FS)
	execSQL(t, pool, fixture)

	return newEnv(pool)
}

func newEnv(pool *pgxpool.Pool) *env {
	clock := time.Date(2026, 11, 18, 10, 0, 0, 0, time.FixedZone("MSK", 3*60*60))
	logger := slog.New(slog.NewJSONHandler(io.Discard, nil))
	srv := app.New(pool, logger, func() time.Time { return clock })
	pub, in := srv.Handlers()

	return &env{pool: pool, pub: pub, in: in}
}

func execSQL(t *testing.T, pool *pgxpool.Pool, sql string) {
	t.Helper()

	if _, err := pool.Exec(context.Background(), sql); err != nil {
		t.Fatal(err)
	}
}

func request(h http.Handler, method, path, body string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	if method == http.MethodPost {
		r.Header.Set("Content-Type", "application/json")
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)

	return w
}

func decode[T any](t *testing.T, w *httptest.ResponseRecorder) T {
	t.Helper()

	if w.Code != http.StatusOK {
		t.Fatalf("код %d, ожидался 200; тело: %s", w.Code, w.Body)
	}
	var body T
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}

	return body
}

func assertError(t *testing.T, w *httptest.ResponseRecorder, status int, code string) {
	t.Helper()

	if w.Code != status {
		t.Fatalf("код %d, ожидался %d; тело: %s", w.Code, status, w.Body)
	}
	body := platformtest.DecodeError(t, w.Body.Bytes())
	if body.Code != code {
		t.Fatalf("код ошибки %q, ожидался %q", body.Code, code)
	}
}

func TestI1StudentCard(t *testing.T) {
	e := setup(t)
	w := request(e.in, http.MethodGet, "/internal/students/"+s1.String(), "")
	got := decode[internalapi.StudentCard](t, w)
	want := internalapi.StudentCard{
		Id: s1, FullName: "Лебедева Анна Викторовна", ShortName: "Лебедева А. В.",
		FacultyId: f1, FacultyShort: "ФМО", FacultyName: "Факультет международных отношений",
		ProgramCode: "41.03.05", ProgramName: "Международные отношения", Course: 2,
		GroupName: "МО-24-03", StudentCardNo: "2401317", StudyForm: internalapi.FullTime,
		Funding: internalapi.Budget, StudyLevel: internalapi.Bachelor,
	}
	if got != want {
		t.Fatalf("карточка: %+v; ожидалась: %+v", got, want)
	}

	assertError(t, request(e.in, http.MethodGet, "/internal/students/"+unknown.String(), ""), 404, "not_found")
}

func TestI2StudentMembership(t *testing.T) {
	e := setup(t)
	w := request(e.in, http.MethodGet, "/internal/students/"+s1.String()+"/membership", "")
	got := decode[internalapi.Membership](t, w)
	if got.StudentId != s1 || got.FacultyId != f1 || got.Course != 2 {
		t.Fatalf("неверная принадлежность: %+v", got)
	}
	assertIDs(t, got.GroupIds, []uuid.UUID{g1, l1, l2})

	// Без языковых групп остаётся академическая, а не null.
	onlyAcademic := decode[internalapi.Membership](t,
		request(e.in, http.MethodGet, "/internal/students/"+s2.String()+"/membership", ""))
	assertIDs(t, onlyAcademic.GroupIds, []uuid.UUID{g2})
	assertError(t, request(e.in, http.MethodGet, "/internal/students/"+unknown.String()+"/membership", ""), 404, "not_found")
}

func TestI3Group(t *testing.T) {
	e := setup(t)
	got := decode[internalapi.Group](t, request(e.in, http.MethodGet, "/internal/groups/"+g1.String(), ""))
	want := internalapi.Group{Id: g1, Name: "МО-24-03", Kind: internalapi.Academic, Course: 2, FacultyId: f1}
	if got != want {
		t.Fatalf("группа: %+v; ожидалась: %+v", got, want)
	}

	language := decode[internalapi.Group](t, request(e.in, http.MethodGet, "/internal/groups/"+l1.String(), ""))
	if language.Kind != internalapi.Language || language.FacultyId != f1 {
		t.Fatalf("неверная языковая группа: %+v", language)
	}
	assertError(t, request(e.in, http.MethodGet, "/internal/groups/"+unknown.String(), ""), 404, "not_found")
}

func TestI4ResolveAudience(t *testing.T) {
	e := setup(t)
	cases := []struct {
		name string
		body string
		ids  []uuid.UUID
	}{
		{"академическая группа", fmt.Sprintf(`{"kind":"group","group_id":%q}`, g1), []uuid.UUID{s1}},
		{"курс факультета", fmt.Sprintf(`{"kind":"course","faculty_id":%q,"course":2}`, f1), []uuid.UUID{s1}},
		{"языковая группа", fmt.Sprintf(`{"kind":"group","group_id":%q}`, l1), []uuid.UUID{s1, s3}},
		{"факультет", fmt.Sprintf(`{"kind":"faculty","faculty_id":%q}`, f1), []uuid.UUID{s1, s3}},
		{"все", `{"kind":"all"}`, []uuid.UUID{s1, s2, s3}},
		{"один студент", fmt.Sprintf(`{"kind":"user","user_id":%q}`, s2), []uuid.UUID{s2}},
		{"неизвестная группа", fmt.Sprintf(`{"kind":"group","group_id":%q}`, unknown), []uuid.UUID{}},
		{"неизвестный студент", fmt.Sprintf(`{"kind":"user","user_id":%q}`, unknown), []uuid.UUID{}},
	}
	names := map[uuid.UUID]internalapi.StudentRef{
		s1: {Id: s1, ShortName: "Лебедева А. В.", GroupName: "МО-24-03"},
		s2: {Id: s2, ShortName: "Соколов М. О.", GroupName: "МЭО-тест"},
		s3: {Id: s3, ShortName: "Северина В. П.", GroupName: "МО-другой-курс"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := decode[internalapi.ResolveAudience200JSONResponse](t,
				request(e.in, http.MethodPost, "/internal/audience/students", tc.body))
			if got.Students == nil {
				t.Fatal("students должен быть массивом, не null")
			}
			ids := make([]uuid.UUID, 0, len(got.Students))
			for _, student := range got.Students {
				ids = append(ids, student.Id)
				if want, ok := names[student.Id]; !ok || student != want {
					t.Fatalf("неверная ссылка на студента: %+v", student)
				}
			}
			assertIDs(t, ids, tc.ids)
		})
	}

	w := request(e.in, http.MethodPost, "/internal/audience/students", `{"kind":"faculty"}`)
	assertError(t, w, 400, "validation_failed")
	if platformtest.DecodeError(t, w.Body.Bytes()).Details.Fields["faculty_id"] == "" {
		t.Fatal("нет ошибки поля faculty_id")
	}
}

func assertIDs(t *testing.T, got, want []uuid.UUID) {
	t.Helper()

	actual := make([]string, 0, len(got))
	expected := make([]string, 0, len(want))
	for _, id := range got {
		actual = append(actual, id.String())
	}
	for _, id := range want {
		expected = append(expected, id.String())
	}
	slices.Sort(actual)
	slices.Sort(expected)
	if !reflect.DeepEqual(actual, expected) {
		t.Fatalf("ID: %v; ожидались: %v", actual, expected)
	}
}

func TestInvalidAudience(t *testing.T) {
	e := setup(t)
	cases := []struct {
		body  string
		field string
	}{
		{`{}`, "kind"},
		{`{"kind":"unknown"}`, "kind"},
		{`{"kind":"course","course":2}`, "faculty_id"},
		{fmt.Sprintf(`{"kind":"course","faculty_id":%q}`, f1), "course"},
		{fmt.Sprintf(`{"kind":"course","faculty_id":%q,"course":0}`, f1), "course"},
		{fmt.Sprintf(`{"kind":"course","faculty_id":%q,"course":7}`, f1), "course"},
		{`{"kind":"group"}`, "group_id"},
		{`{"kind":"user"}`, "user_id"},
		{fmt.Sprintf(`{"kind":"faculty","faculty_id":%q}`, uuid.Nil), "faculty_id"},
		{fmt.Sprintf(`{"kind":"group","group_id":%q}`, uuid.Nil), "group_id"},
		{fmt.Sprintf(`{"kind":"user","user_id":%q}`, uuid.Nil), "user_id"},
	}
	for _, tc := range cases {
		t.Run(tc.body, func(t *testing.T) {
			w := request(e.in, http.MethodPost, "/internal/audience/students", tc.body)
			assertError(t, w, 400, "validation_failed")
			if platformtest.DecodeError(t, w.Body.Bytes()).Details.Fields[tc.field] == "" {
				t.Fatalf("нет ошибки поля %s", tc.field)
			}
		})
	}
	for _, body := range []string{"", "null", "{", `{"kind":"group","group_id":"broken"}`} {
		assertError(t, request(e.in, http.MethodPost, "/internal/audience/students", body), 400, "validation_failed")
	}
	for _, path := range []string{"/internal/students/broken", "/internal/students/broken/membership", "/internal/groups/broken"} {
		assertError(t, request(e.in, http.MethodGet, path, ""), 400, "validation_failed")
	}
}

func TestInternalAPIIsNotRegisteredOnPublicPort(t *testing.T) {
	e := setup(t)
	for _, path := range []string{
		"/internal/students/" + s1.String(),
		"/internal/students/" + s1.String() + "/membership",
		"/internal/groups/" + g1.String(),
	} {
		assertError(t, request(e.pub, http.MethodGet, path, ""), 404, "not_found")
	}
	assertError(t, request(e.pub, http.MethodPost, "/internal/audience/students", `{"kind":"all"}`), 404, "not_found")
	for _, h := range []http.Handler{e.pub, e.in} {
		if w := request(h, http.MethodGet, "/healthz", ""); w.Code != 200 {
			t.Fatalf("healthz: %d, %s", w.Code, w.Body)
		}
	}
}

func TestSeedMatchesSharedContract(t *testing.T) {
	pool := platformtest.NewDB(t, migrations.FS)
	sql, err := os.ReadFile("../../seed/00_reference.sql")
	if err != nil {
		t.Fatal(err)
	}
	execSQL(t, pool, string(sql))
	e := newEnv(pool)

	for _, tc := range []struct {
		id                                                                       uuid.UUID
		fullName, shortName, facultyShort, facultyName, programCode, programName string
		course                                                                   int
		group, card                                                              string
		funding                                                                  internalapi.StudentCardFunding
	}{
		{s1, "Лебедева Анна Викторовна", "Лебедева А. В.", "ФМО", "Факультет международных отношений",
			"41.03.05", "Международные отношения", 2, "МО-24-03", "2401317", internalapi.Budget},
		{s2, "Соколов Максим Олегович", "Соколов М. О.", "МЭО", "Факультет международных экономических отношений",
			"38.03.01", "Экономика", 3, "МЭО-23-02", "2302214", internalapi.Contract},
	} {
		card := decode[internalapi.StudentCard](t,
			request(e.in, http.MethodGet, "/internal/students/"+tc.id.String(), ""))
		if card.FullName != tc.fullName || card.ShortName != tc.shortName || card.FacultyShort != tc.facultyShort ||
			card.FacultyName != tc.facultyName || card.ProgramCode != tc.programCode || card.ProgramName != tc.programName ||
			card.Course != tc.course || card.GroupName != tc.group || card.StudentCardNo != tc.card ||
			card.Funding != tc.funding || card.StudyForm != internalapi.FullTime || card.StudyLevel != internalapi.Bachelor {
			t.Fatalf("seed не совпадает с общим контрактом: %+v", card)
		}
		membership := decode[internalapi.Membership](t,
			request(e.in, http.MethodGet, "/internal/students/"+tc.id.String()+"/membership", ""))
		if len(membership.GroupIds) != 3 {
			t.Fatalf("у тестового студента должно быть три группы: %+v", membership)
		}
	}

	for _, group := range []uuid.UUID{g1, g2} {
		got := decode[internalapi.ResolveAudience200JSONResponse](t,
			request(e.in, http.MethodPost, "/internal/audience/students", fmt.Sprintf(`{"kind":"group","group_id":%q}`, group)))
		if len(got.Students) != 10 {
			t.Fatalf("в группе %s должно быть 10 студентов, получено %d", group, len(got.Students))
		}
	}
	var count int
	if err := pool.QueryRow(context.Background(), "SELECT count(*) FROM teachers").Scan(&count); err != nil || count != 12 {
		t.Fatalf("ожидались 12 преподавателей, получено %d: %v", count, err)
	}
}

func TestLogsDoNotContainStudentNames(t *testing.T) {
	e := setup(t)
	var logs bytes.Buffer
	clock := time.Date(2026, 11, 18, 10, 0, 0, 0, time.UTC)
	srv := app.New(e.pool, slog.New(slog.NewJSONHandler(&logs, nil)), func() time.Time { return clock })
	_, in := srv.Handlers()
	decode[internalapi.StudentCard](t, request(in, http.MethodGet, "/internal/students/"+s1.String(), ""))
	decode[internalapi.ResolveAudience200JSONResponse](t, request(in, http.MethodPost, "/internal/audience/students", `{"kind":"all"}`))
	for _, name := range []string{"Лебедева", "Соколов", "Северина", "Анна", "2401317"} {
		if strings.Contains(logs.String(), name) {
			t.Fatalf("персональные данные попали в журнал: %q", name)
		}
	}
}
