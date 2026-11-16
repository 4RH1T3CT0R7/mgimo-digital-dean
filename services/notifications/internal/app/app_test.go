package app

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"slices"
	"testing"
	"time"

	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/clients/academic"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/platform"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/platform/platformtest"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/notifications/internal/api"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/notifications/migrations"
	"github.com/google/uuid"
)

var (
	s1, s2, f1, f2 = uuid.New(), uuid.New(), uuid.New(), uuid.New()
	g1, g2, g3, g7 = uuid.New(), uuid.New(), uuid.New(), uuid.New()
	clock          = time.Date(2026, 11, 18, 10, 0, 0, 0, moscow)
	testLog        = slog.New(slog.NewTextHandler(io.Discard, nil))
)

type env struct {
	t       *testing.T
	s       *Server
	handler http.Handler
	now     time.Time
}

func setup(t *testing.T) *env {
	t.Helper()
	pool := platformtest.NewDB(t, migrations.FS)
	e := &env{t: t, now: clock}
	mock := httptest.NewServer(http.HandlerFunc(fakeAcademic))
	t.Cleanup(mock.Close)
	ac, err := academic.NewClientWithResponses(mock.URL)
	if err != nil {
		t.Fatal(err)
	}
	e.s = New(pool, testLog, func() time.Time { return e.now }, ac)
	e.handler, _ = e.s.Handlers()
	return e
}

func fakeAcademic(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	var value any
	switch r.URL.Path {
	case "/internal/students/" + s1.String() + "/membership":
		value = academic.Membership{StudentId: s1, FacultyId: f1, Course: 2, GroupIds: []uuid.UUID{g1, g2, g3}}
	case "/internal/students/" + s2.String() + "/membership":
		value = academic.Membership{StudentId: s2, FacultyId: f2, Course: 3, GroupIds: []uuid.UUID{g7}}
	case "/internal/groups/" + g2.String():
		value = academic.Group{Id: g2, FacultyId: f1, Course: 2, Name: "Англ-12", Kind: "language"}
	case "/internal/groups/" + g7.String():
		value = academic.Group{Id: g7, FacultyId: f2, Course: 3, Name: "МЭО-23-02", Kind: "academic"}
	case "/internal/faculties/" + f1.String():
		value = academic.Faculty{Id: f1, ShortName: "ФМО"}
	case "/internal/audience/students":
		var a academic.Audience
		if err := json.NewDecoder(r.Body).Decode(&a); err != nil || a.GroupId == nil || *a.GroupId != g2 {
			platform.WriteError(w, platform.Validation(map[string]string{"group_id": "Неизвестная группа"}))
			return
		}
		value = map[string]any{"students": []academic.StudentRef{
			{Id: s1, ShortName: "Лебедева А. В.", GroupName: "МО-24-03"},
			{Id: g1, ShortName: "Орлова Д. И.", GroupName: "МО-24-03"},
			{Id: g3, ShortName: "Ковалёв И. А.", GroupName: "МО-24-03"},
		}}
	default:
		platform.WriteError(w, platform.NotFound())
		return
	}
	_ = json.NewEncoder(w).Encode(value)
}

func (e *env) req(method, path string, id platform.Identity, body any, status int) *httptest.ResponseRecorder {
	e.t.Helper()
	var payload []byte
	if body != nil {
		var err error
		payload, err = json.Marshal(body)
		if err != nil {
			e.t.Fatal(err)
		}
	}
	r := platformtest.As(httptest.NewRequest(method, path, bytes.NewReader(payload)), id)
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	e.handler.ServeHTTP(w, r)
	if w.Code != status {
		e.t.Fatalf("%s %s: %d вместо %d: %s", method, path, w.Code, status, w.Body)
	}
	return w
}

func decode[T any](t *testing.T, w *httptest.ResponseRecorder) T {
	t.Helper()
	var v T
	if err := json.Unmarshal(w.Body.Bytes(), &v); err != nil {
		t.Fatal(err)
	}
	return v
}

func (e *env) notification(a api.Audience, kind string, important, ack bool, at time.Time) uuid.UUID {
	e.t.Helper()
	id := uuid.New()
	_, err := e.s.pool.Exec(context.Background(), `INSERT INTO notifications
 (id,type,title,body,important,requires_ack,audience_kind,audience_user_id,audience_faculty_id,audience_course,audience_group_id,created_at,author_id)
 VALUES ($1,$2,'Заголовок','Текст',$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
		id, kind, important, ack, a.Kind, a.UserId, a.FacultyId, a.Course, a.GroupId, at, uuid.New())
	if err != nil {
		e.t.Fatal(err)
	}
	return id
}

func (e *env) deadline(a api.Audience, at time.Time) uuid.UUID {
	e.t.Helper()
	id := uuid.New()
	_, err := e.s.pool.Exec(context.Background(), `INSERT INTO deadlines
 (id,title,kind,due_at,audience_kind,audience_user_id,audience_faculty_id,audience_course,audience_group_id,created_at)
 VALUES ($1,'Дедлайн','credit',$2,$3,$4,$5,$6,$7,$8)`, id, at, a.Kind, a.UserId, a.FacultyId, a.Course, a.GroupId, clock)
	if err != nil {
		e.t.Fatal(err)
	}
	return id
}

func (e *env) feed(query string) api.FeedList {
	return decode[api.FeedList](e.t, e.req("GET", "/me/feed"+query, platformtest.Student(s1), nil, 200))
}

func (e *env) counters() api.FeedCounters {
	return decode[api.FeedCounters](e.t, e.req("GET", "/me/feed/counters", platformtest.Student(s1), nil, 200))
}

func (e *env) mark(id uuid.UUID, action string, status int) {
	e.t.Helper()
	e.req("POST", "/me/feed/"+id.String()+"/"+action, platformtest.Student(s1), nil, status)
}

func ids(items []api.FeedItem) []uuid.UUID {
	result := make([]uuid.UUID, 0, len(items))
	for _, item := range items {
		result = append(result, item.Id)
	}
	return result
}

func TestN1Audience(t *testing.T) {
	e := setup(t)
	course := 2
	for _, tc := range []struct {
		audience api.Audience
		visible  bool
	}{
		{api.Audience{Kind: api.All}, true},
		{api.Audience{Kind: api.Faculty, FacultyId: &f1}, true},
		{api.Audience{Kind: api.Faculty, FacultyId: &f2}, false},
		{api.Audience{Kind: api.Course, FacultyId: &f1, Course: &course}, true},
		{api.Audience{Kind: api.Group, GroupId: &g2, FacultyId: &f1}, true},
		{api.Audience{Kind: api.Group, GroupId: &g7, FacultyId: &f2}, false},
		{api.Audience{Kind: api.User, UserId: &s1}, true},
		{api.Audience{Kind: api.User, UserId: &s2}, false},
	} {
		id := e.notification(tc.audience, "announcement", false, false, clock)
		if found := slices.Contains(ids(e.feed("").Items), id); found != tc.visible {
			t.Fatalf("адресат %+v: видно %v", tc.audience, found)
		}
	}
	if got := e.feed("").Total; got != 5 {
		t.Fatalf("total = %d", got)
	}
}

func TestN2PriorityAndPagination(t *testing.T) {
	e := setup(t)
	a := api.Audience{Kind: api.All}
	unread := e.notification(a, "announcement", true, false, clock.Add(-3*time.Hour))
	importantRead := e.notification(a, "announcement", true, false, clock.Add(-2*time.Hour))
	latest := e.notification(a, "announcement", false, false, clock.Add(-time.Hour))
	e.mark(importantRead, "read", 204)
	want := []uuid.UUID{unread, latest, importantRead}
	if got := ids(e.feed("").Items); !slices.Equal(got, want) {
		t.Fatalf("порядок %v", got)
	}
	page := e.feed("?limit=1&offset=1")
	if page.Total != 3 || !slices.Equal(ids(page.Items), want[1:2]) {
		t.Fatalf("страница %+v", page)
	}
}

func TestN3Filters(t *testing.T) {
	e := setup(t)
	a := api.Audience{Kind: api.All}
	read := e.notification(a, "news", false, false, clock)
	announcement := e.notification(a, "announcement", false, false, clock)
	e.mark(read, "read", 204)
	for _, q := range []string{"?unread_only=true", "?type=announcement", "?unread_only=true&type=announcement"} {
		if got := ids(e.feed(q).Items); !slices.Equal(got, []uuid.UUID{announcement}) {
			t.Fatalf("%s: %v", q, got)
		}
	}
	if got := e.feed("?type=news,announcement").Total; got != 2 {
		t.Fatalf("total с двумя типами: %d", got)
	}
}

func TestN4Read(t *testing.T) {
	e := setup(t)
	own := e.notification(api.Audience{Kind: api.User, UserId: &s1}, "application_status", false, false, clock)
	other := e.notification(api.Audience{Kind: api.User, UserId: &s2}, "application_status", false, false, clock)
	e.mark(own, "read", 204)
	e.now = clock.Add(time.Hour)
	e.mark(own, "read", 204)
	e.mark(other, "read", 404)
	e.mark(uuid.New(), "read", 404)
	if got := e.feed("").Items[0].ReadAt; got == nil || !got.Equal(clock) {
		t.Fatalf("read_at: %v", got)
	}
}

func TestN5Ack(t *testing.T) {
	e := setup(t)
	a := api.Audience{Kind: api.All}
	important := e.notification(a, "announcement", true, true, clock)
	ordinary := e.notification(a, "news", false, false, clock)
	e.mark(important, "ack", 204)
	e.now = clock.Add(time.Hour)
	e.mark(important, "ack", 204)
	w := e.req("POST", "/me/feed/"+ordinary.String()+"/ack", platformtest.Student(s1), nil, 409)
	if code := platformtest.DecodeError(t, w.Body.Bytes()).Code; code != "conflict" {
		t.Fatalf("код ошибки %q", code)
	}
	for _, item := range e.feed("").Items {
		if item.Id == important && (item.ReadAt == nil || !item.ReadAt.Equal(clock) || item.AckedAt == nil || !item.AckedAt.Equal(clock)) {
			t.Fatalf("отметки %+v", item)
		}
		if item.Id == important && (!inMSK(*item.ReadAt) || !inMSK(*item.AckedAt)) {
			t.Fatalf("отметки не в московском времени: %v, %v", item.ReadAt, item.AckedAt)
		}
	}
}

func inMSK(t time.Time) bool {
	_, offset := t.Zone()
	return offset == 3*60*60
}

// Публикация с будущей датой (seed) не видна и не считается до своего дня.
func TestFuturePublication(t *testing.T) {
	e := setup(t)
	future := e.notification(api.Audience{Kind: api.All}, "announcement", true, true, clock.Add(24*time.Hour))
	if f := e.feed(""); f.Total != 0 || len(f.Items) != 0 {
		t.Fatalf("лента до публикации: %+v", f)
	}
	if c := e.counters(); c.Unread != 0 || c.ImportantUnacked != 0 {
		t.Fatalf("счётчики до публикации: %+v", c)
	}
	e.mark(future, "read", 404)
	e.mark(future, "ack", 404)
	e.req("POST", "/me/feed/read-all", platformtest.Student(s1), nil, 204)
	e.now = clock.Add(24 * time.Hour)
	if got := ids(e.feed("?unread_only=true").Items); !slices.Equal(got, []uuid.UUID{future}) {
		t.Fatalf("лента в день публикации: %v", got)
	}
	if c := e.counters(); c.Unread != 1 || c.ImportantUnacked != 1 {
		t.Fatalf("счётчики в день публикации: %+v", c)
	}
}

func TestN6ReadAll(t *testing.T) {
	e := setup(t)
	a := api.Audience{Kind: api.All}
	first := e.notification(a, "announcement", true, true, clock)
	e.notification(a, "announcement", true, true, clock)
	e.mark(first, "ack", 204)
	e.now = clock.Add(time.Hour)
	e.req("POST", "/me/feed/read-all", platformtest.Student(s1), nil, 204)
	c := e.counters()
	if c.Unread != 0 || c.ImportantUnacked != 1 {
		t.Fatalf("счётчики %+v", c)
	}
	for _, item := range e.feed("").Items {
		if item.AckedAt != nil && (item.Id != first || !item.AckedAt.Equal(clock)) {
			t.Fatalf("подтверждение изменилось: %+v", item)
		}
	}
}

func TestN7DeadlineCounter(t *testing.T) {
	e := setup(t)
	a := api.Audience{Kind: api.All}
	e.deadline(a, clock.AddDate(0, 0, 2))
	e.deadline(a, clock.AddDate(0, 0, 5))
	if got := e.counters().DeadlinesSoon; got != 1 {
		t.Fatalf("deadlines_soon = %d", got)
	}
}

func TestN8DeadlineWindow(t *testing.T) {
	e := setup(t)
	a := api.Audience{Kind: api.All}
	d18 := e.deadline(a, time.Date(2026, 11, 18, 23, 59, 0, 0, moscow))
	d20 := e.deadline(a, time.Date(2026, 11, 20, 0, 0, 0, 0, moscow))
	e.deadline(a, time.Date(2026, 12, 5, 0, 0, 0, 0, moscow))
	e.deadline(a, time.Date(2026, 12, 10, 0, 0, 0, 0, moscow))
	e.deadline(a, clock.Add(-time.Minute))
	got := decode[[]api.Deadline](t, e.req("GET", "/me/deadlines?days=14", platformtest.Student(s1), nil, 200))
	if len(got) != 2 || got[0].Id != d18 || got[0].DaysLeft != 0 || got[1].Id != d20 || got[1].DaysLeft != 2 {
		t.Fatalf("дедлайны %+v", got)
	}
}
