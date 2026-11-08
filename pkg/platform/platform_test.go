package platform_test

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/platform"
)

var (
	user    = uuid.MustParse("30000000-0000-4000-8000-000000000001")
	faculty = uuid.MustParse("10000000-0000-4000-8000-000000000001")
)

func TestIdentityFromHeaders(t *testing.T) {
	cases := []struct {
		name               string
		id, role, faculty  string
		ok                 bool
		wantRole           platform.Role
		wantFacultyPresent bool
	}{
		{"студент", user.String(), "student", "", true, platform.RoleStudent, false},
		{"студент с факультетом — факультет игнорируется", user.String(), "student", faculty.String(), true, platform.RoleStudent, false},
		{"сотрудник", user.String(), "staff", faculty.String(), true, platform.RoleStaff, true},
		{"сотрудник без факультета", user.String(), "staff", "", false, "", false},
		{"администратор", user.String(), "admin", "", true, platform.RoleAdmin, false},
		{"неизвестная роль", user.String(), "root", "", false, "", false},
		{"не UUID", "abc", "student", "", false, "", false},
		{"пусто", "", "", "", false, "", false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			h := http.Header{}
			h.Set(platform.HeaderUserID, c.id)
			h.Set(platform.HeaderUserRole, c.role)
			h.Set(platform.HeaderFacultyID, c.faculty)
			id, ok := platform.IdentityFromHeaders(h)
			if ok != c.ok {
				t.Fatalf("ok = %v, ждали %v", ok, c.ok)
			}
			if ok && (id.Role != c.wantRole || (id.FacultyID != nil) != c.wantFacultyPresent) {
				t.Fatalf("личность %+v", id)
			}
		})
	}
}

func TestRoleChecksAndFacultyScope(t *testing.T) {
	handler := func(check func(r *http.Request) error) http.Handler {
		return platform.Middleware(slog.New(slog.NewTextHandler(io.Discard, nil)), http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if err := check(r); err != nil {
				platform.WriteError(w, err)
				return
			}
			w.WriteHeader(http.StatusOK)
		}))
	}
	student := func(r *http.Request) error { _, err := platform.RequireStudent(r.Context()); return err }
	staff := func(r *http.Request) error { _, err := platform.RequireStaffOrAdmin(r.Context()); return err }
	as := func(role platform.Role, fac *uuid.UUID) *http.Request {
		r := httptest.NewRequest(http.MethodGet, "/", nil)
		platform.SetIdentityHeaders(r.Header, platform.Identity{UserID: user, Role: role, FacultyID: fac})
		return r
	}
	cases := []struct {
		name  string
		check func(*http.Request) error
		req   *http.Request
		want  int
	}{
		{"/me без личности", student, httptest.NewRequest(http.MethodGet, "/", nil), 401},
		{"/me студентом", student, as(platform.RoleStudent, nil), 200},
		{"/me сотрудником", student, as(platform.RoleStaff, &faculty), 403},
		{"/staff студентом", staff, as(platform.RoleStudent, nil), 403},
		{"/staff сотрудником", staff, as(platform.RoleStaff, &faculty), 200},
		{"/staff администратором", staff, as(platform.RoleAdmin, nil), 200},
	}
	for _, c := range cases {
		w := httptest.NewRecorder()
		handler(c.check).ServeHTTP(w, c.req)
		if w.Code != c.want {
			t.Errorf("%s: %d, ждали %d", c.name, w.Code, c.want)
		}
	}

	if (platform.Identity{Role: platform.RoleAdmin}).FacultyScope() != nil {
		t.Error("у администратора фильтра по факультету быть не должно")
	}
	if s := (platform.Identity{Role: platform.RoleStaff, FacultyID: &faculty}).FacultyScope(); s == nil || *s != faculty {
		t.Error("сотрудник должен быть ограничен своим факультетом")
	}
}

func TestWriteError(t *testing.T) {
	w := httptest.NewRecorder()
	platform.WriteError(w, platform.Validation(map[string]string{"title": "Обязательное поле"}))
	var body struct {
		Code    string
		Message string
		Details struct{ Fields map[string]string }
	}
	_ = json.Unmarshal(w.Body.Bytes(), &body)
	if w.Code != 400 || body.Code != "validation_failed" || body.Details.Fields["title"] == "" {
		t.Fatalf("validation: %d %s", w.Code, w.Body)
	}

	w = httptest.NewRecorder()
	platform.WriteError(w, platform.TooManyAttempts(900))
	if w.Code != 429 || w.Header().Get("Retry-After") != "900" {
		t.Fatalf("429: %d %v", w.Code, w.Header())
	}

	w = httptest.NewRecorder()
	platform.WriteError(w, errors.New("pq: пароль от БД secret123 не подошёл"))
	if w.Code != 500 || strings.Contains(w.Body.String(), "secret123") {
		t.Fatalf("внутренняя ошибка не должна раскрывать подробности: %s", w.Body)
	}
}

func TestMiddleware(t *testing.T) {
	var logs bytes.Buffer
	var gotUser string
	h := platform.Middleware(slog.New(slog.NewJSONHandler(&logs, nil)), http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/panic" {
			panic("бум")
		}
		platform.Log(r.Context()).Info("handler")
		if id, ok := platform.IdentityFrom(r.Context()); ok {
			gotUser = id.UserID.String()
		}
		w.WriteHeader(http.StatusOK)
	}))
	do := func(method, path, ctype, body string, hdr map[string]string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, path, strings.NewReader(body))
		if ctype != "" {
			r.Header.Set("Content-Type", ctype)
		}
		for k, v := range hdr {
			r.Header.Set(k, v)
		}
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		return w
	}

	t.Run("Content-Type у запросов с телом", func(t *testing.T) {
		cases := []struct {
			method, ctype, body string
			want                int
		}{
			{"POST", "application/json", `{"a":1}`, 200},
			{"POST", "application/json; charset=utf-8", `{"a":1}`, 200},
			{"POST", "multipart/form-data; boundary=x", "--x--", 200},
			{"POST", "text/plain", `{"login":"a","password":"b"}`, 415},
			{"POST", "application/x-www-form-urlencoded", "login=a", 415},
			{"POST", "", `{"a":1}`, 415},
			{"POST", "", "", 200}, // без тела
			{"DELETE", "", "", 200},
			{"GET", "text/plain", "x", 200},
		}
		for _, c := range cases {
			if w := do(c.method, "/x", c.ctype, c.body, nil); w.Code != c.want {
				t.Errorf("%s %q: %d, ждали %d", c.method, c.ctype, w.Code, c.want)
			}
		}
	})

	t.Run("request id", func(t *testing.T) {
		if id := do("GET", "/x", "", "", map[string]string{"X-Request-Id": "abc-123"}).Header().Get("X-Request-Id"); id != "abc-123" {
			t.Errorf("безопасный ID должен сохраняться: %q", id)
		}
		if id := do("GET", "/x", "", "", map[string]string{"X-Request-Id": "evil\"}{\n"}).Header().Get("X-Request-Id"); id == "" || strings.ContainsAny(id, "\"{\n") {
			t.Errorf("опасный ID должен заменяться: %q", id)
		}
		if id := do("GET", "/x", "", "", nil).Header().Get("X-Request-Id"); id == "" {
			t.Error("ID должен генерироваться")
		}
	})

	t.Run("личность и user_id в логах хендлера", func(t *testing.T) {
		logs.Reset()
		do("GET", "/x", "", "", map[string]string{platform.HeaderUserID: user.String(), platform.HeaderUserRole: "student"})
		if gotUser != user.String() {
			t.Fatalf("личность не дошла до хендлера: %q", gotUser)
		}
		for _, line := range strings.Split(strings.TrimSpace(logs.String()), "\n") {
			if strings.Contains(line, `"msg":"handler"`) && !strings.Contains(line, user.String()) {
				t.Fatalf("в логе хендлера нет user_id: %s", line)
			}
		}
	})

	t.Run("паника → 500 в формате ошибки", func(t *testing.T) {
		w := do("GET", "/panic", "", "", nil)
		if w.Code != 500 || !strings.Contains(w.Body.String(), `"code":"internal"`) {
			t.Fatalf("%d %s", w.Code, w.Body)
		}
	})
}

func TestClientIP(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	r.RemoteAddr = "172.18.0.5:41234"
	if ip, ok := platform.ClientIP(r); !ok || ip.String() != "172.18.0.5" {
		t.Errorf("без X-Forwarded-For: %v", ip)
	}
	r.Header.Set("X-Forwarded-For", "1.1.1.1, 203.0.113.7")
	if ip, _ := platform.ClientIP(r); ip.String() != "203.0.113.7" {
		t.Errorf("берётся последний адрес (его ставит шлюз): %v", ip)
	}
}

func TestNewMux(t *testing.T) {
	mux := platform.NewMux()
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/nope", nil))
	if w.Code != 404 || !strings.Contains(w.Body.String(), `"code":"not_found"`) {
		t.Errorf("404 должен быть в формате ошибки: %d %s", w.Code, w.Body)
	}
	w = httptest.NewRecorder()
	mux.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/healthz", nil))
	if w.Code != 200 {
		t.Errorf("healthz: %d", w.Code)
	}
}
