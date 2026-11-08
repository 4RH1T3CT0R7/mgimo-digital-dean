package app_test

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"

	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/platform"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/platform/platformtest"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/auth/internal/app"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/auth/migrations"
)

var (
	msk       = time.FixedZone("MSK", 3*60*60)
	studentID = uuid.MustParse("30000000-0000-4000-8000-000000000001")
	staffID   = uuid.MustParse("40000000-0000-4000-8000-000000000001")
	facultyID = uuid.MustParse("10000000-0000-4000-8000-000000000001")
)

const (
	studentPass = "student-pass-1"
	staffPass   = "staff-pass-1"
)

// env — сервис на отдельной тестовой БД с управляемыми часами и перехватом логов.
type env struct {
	t     *testing.T
	pool  *pgxpool.Pool
	pub   http.Handler
	in    http.Handler
	clock time.Time
	logs  *bytes.Buffer
}

func setup(t *testing.T) *env {
	t.Helper()
	e := &env{t: t, pool: platformtest.NewDB(t, migrations.FS),
		clock: time.Date(2026, 11, 18, 10, 0, 0, 0, msk), logs: &bytes.Buffer{}}
	logger := slog.New(slog.NewJSONHandler(e.logs, nil))
	srv, err := app.New(e.pool, logger, func() time.Time { return e.clock }, bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	e.pub, e.in = srv.Handlers()
	ctx := context.Background()
	must(t, srv.CreateUser(ctx, studentID, "student.mo", studentPass, platform.RoleStudent, "Лебедева А. В.", nil))
	must(t, srv.CreateUser(ctx, staffID, "dekanat.mo", staffPass, platform.RoleStaff, "Деканат ФМО", &facultyID))
	return e
}

func (e *env) login(login, password, ip string) *httptest.ResponseRecorder {
	body, _ := json.Marshal(map[string]string{"login": login, "password": password})
	r := httptest.NewRequest(http.MethodPost, "/login", bytes.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("X-Forwarded-For", ip)
	w := httptest.NewRecorder()
	e.pub.ServeHTTP(w, r)
	return w
}

func (e *env) verify(token string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodGet, "/internal/verify", nil)
	if token != "" {
		r.AddCookie(&http.Cookie{Name: app.CookieName, Value: token})
	}
	w := httptest.NewRecorder()
	e.in.ServeHTTP(w, r)
	return w
}

func sessionToken(t *testing.T, w *httptest.ResponseRecorder) string {
	t.Helper()
	for _, c := range w.Result().Cookies() {
		if c.Name == app.CookieName {
			return c.Value
		}
	}
	t.Fatalf("нет cookie %s в ответе: %v", app.CookieName, w.Header())
	return ""
}

func must(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
}

func TestLoginSuccessSetsSecureCookieAndStoresOnlyHash(t *testing.T) {
	e := setup(t)
	w := e.login("student.mo", studentPass, "10.0.0.1")
	if w.Code != http.StatusOK {
		t.Fatalf("код %d, тело %s", w.Code, w.Body)
	}
	var me struct{ Id, Login, Role, DisplayName string }
	must(t, json.Unmarshal(w.Body.Bytes(), &me))
	if me.Role != "student" || me.Login != "student.mo" || me.Id != studentID.String() {
		t.Fatalf("неверный Me: %+v", me)
	}

	raw := w.Header().Get("Set-Cookie")
	for _, attr := range []string{"HttpOnly", "Secure", "SameSite=Lax", "Path=/", "Max-Age=86400"} {
		if !strings.Contains(raw, attr) {
			t.Errorf("в cookie нет %q: %s", attr, raw)
		}
	}

	token := sessionToken(t, w)
	if b, err := base64.RawURLEncoding.DecodeString(token); err != nil || len(b) != 32 {
		t.Fatalf("токен должен быть 32 случайных байта в base64url: %q", token)
	}
	var stored []byte
	must(t, e.pool.QueryRow(context.Background(), "SELECT token_hash FROM sessions").Scan(&stored))
	if len(stored) != 32 || bytes.Contains(stored, []byte(token)) {
		t.Fatalf("в БД должен быть только SHA-256 токена")
	}
}

func TestWrongPasswordAndUnknownLoginLookTheSame(t *testing.T) {
	e := setup(t)
	wrong := e.login("student.mo", "nope", "10.0.0.1")
	unknown := e.login("nobody", "nope", "10.0.0.2")
	for _, w := range []*httptest.ResponseRecorder{wrong, unknown} {
		if w.Code != http.StatusUnauthorized {
			t.Fatalf("код %d, ждали 401", w.Code)
		}
	}
	a, b := platformtest.DecodeError(t, wrong.Body.Bytes()), platformtest.DecodeError(t, unknown.Body.Bytes())
	if a.Code != "invalid_credentials" || a.Code != b.Code || a.Message != b.Message {
		t.Fatalf("ответы должны совпадать: %+v vs %+v", a, b)
	}
	if wrong.Header().Get("Set-Cookie") != "" {
		t.Fatal("при ошибке cookie не выдаётся")
	}
}

func TestLockAfterFiveFailuresEvenWithCorrectPassword(t *testing.T) {
	e := setup(t)
	for i := 0; i < app.MaxLoginFails; i++ {
		if w := e.login("student.mo", "wrong", "10.0.0.1"); w.Code != http.StatusUnauthorized {
			t.Fatalf("попытка %d: код %d", i+1, w.Code)
		}
	}
	w := e.login("student.mo", studentPass, "10.0.0.9")
	if w.Code != http.StatusTooManyRequests || w.Header().Get("Retry-After") == "" {
		t.Fatalf("ждали 429 с Retry-After, получили %d %v", w.Code, w.Header())
	}
	e.clock = e.clock.Add(app.AttemptWindow + time.Minute)
	if w := e.login("student.mo", studentPass, "10.0.0.1"); w.Code != http.StatusOK {
		t.Fatalf("после окна вход должен работать: %d", w.Code)
	}
}

func TestSuccessfulLoginResetsFailureCounter(t *testing.T) {
	e := setup(t)
	for i := 0; i < app.MaxLoginFails-1; i++ {
		e.login("student.mo", "wrong", "10.0.0.1")
	}
	if w := e.login("student.mo", studentPass, "10.0.0.1"); w.Code != http.StatusOK {
		t.Fatalf("код %d", w.Code)
	}
	for i := 0; i < app.MaxLoginFails-1; i++ {
		e.login("student.mo", "wrong", "10.0.0.1")
	}
	if w := e.login("student.mo", studentPass, "10.0.0.1"); w.Code != http.StatusOK {
		t.Fatalf("неудачи до успешного входа не должны считаться: %d", w.Code)
	}
}

func TestLockByIP(t *testing.T) {
	e := setup(t)
	for i := 0; i < app.MaxIPFails; i++ {
		e.login(fmt.Sprintf("user%d", i), "wrong", "10.0.0.66")
	}
	if w := e.login("student.mo", studentPass, "10.0.0.66"); w.Code != http.StatusTooManyRequests {
		t.Fatalf("ждали 429 по IP, получили %d", w.Code)
	}
	if w := e.login("student.mo", studentPass, "10.0.0.67"); w.Code != http.StatusOK {
		t.Fatalf("с другого IP вход должен работать: %d", w.Code)
	}
}

func TestVerifySession(t *testing.T) {
	e := setup(t)

	student := e.verify(sessionToken(t, e.login("student.mo", studentPass, "10.0.0.1")))
	if student.Code != http.StatusNoContent {
		t.Fatalf("студент: код %d", student.Code)
	}
	if student.Header().Get("X-User-Id") != studentID.String() || student.Header().Get("X-User-Role") != "student" {
		t.Fatalf("заголовки студента: %v", student.Header())
	}
	if _, ok := student.Header()["X-Faculty-Id"]; ok {
		t.Fatal("у студента не должно быть X-Faculty-Id")
	}

	staff := e.verify(sessionToken(t, e.login("dekanat.mo", staffPass, "10.0.0.2")))
	if staff.Code != http.StatusNoContent || staff.Header().Get("X-Faculty-Id") != facultyID.String() {
		t.Fatalf("сотрудник: %d %v", staff.Code, staff.Header())
	}

	for name, token := range map[string]string{"без cookie": "", "мусор": "garbage"} {
		if w := e.verify(token); w.Code != http.StatusUnauthorized {
			t.Errorf("%s: код %d, ждали 401", name, w.Code)
		}
	}
}

func TestExpiredSessionIsRejectedAndDeleted(t *testing.T) {
	e := setup(t)
	token := sessionToken(t, e.login("student.mo", studentPass, "10.0.0.1"))
	e.clock = e.clock.Add(app.SessionTTL + time.Minute)
	if w := e.verify(token); w.Code != http.StatusUnauthorized {
		t.Fatalf("истёкшая сессия: код %d", w.Code)
	}
	var n int
	must(t, e.pool.QueryRow(context.Background(), "SELECT count(*) FROM sessions").Scan(&n))
	if n != 0 {
		t.Fatalf("истёкшая сессия должна быть удалена, осталось %d", n)
	}
}

func TestLogout(t *testing.T) {
	e := setup(t)
	token := sessionToken(t, e.login("student.mo", studentPass, "10.0.0.1"))

	r := httptest.NewRequest(http.MethodPost, "/logout", nil)
	r.AddCookie(&http.Cookie{Name: app.CookieName, Value: token})
	w := httptest.NewRecorder()
	e.pub.ServeHTTP(w, r)
	if w.Code != http.StatusNoContent || !strings.Contains(w.Header().Get("Set-Cookie"), "Max-Age=0") {
		t.Fatalf("выход: %d %v", w.Code, w.Header())
	}
	if v := e.verify(token); v.Code != http.StatusUnauthorized {
		t.Fatalf("после выхода сессия должна быть недействительна: %d", v.Code)
	}

	anon := httptest.NewRecorder()
	e.pub.ServeHTTP(anon, httptest.NewRequest(http.MethodPost, "/logout", nil))
	if anon.Code != http.StatusNoContent {
		t.Fatalf("выход без сессии: %d", anon.Code)
	}
}

func TestGetMeRequiresIdentityFromGateway(t *testing.T) {
	e := setup(t)
	w := httptest.NewRecorder()
	e.pub.ServeHTTP(w, platformtest.As(httptest.NewRequest(http.MethodGet, "/me", nil), platformtest.Staff(staffID, facultyID)))
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), facultyID.String()) {
		t.Fatalf("с личностью: %d %s", w.Code, w.Body)
	}
	anon := httptest.NewRecorder()
	e.pub.ServeHTTP(anon, httptest.NewRequest(http.MethodGet, "/me", nil))
	if anon.Code != http.StatusUnauthorized {
		t.Fatalf("без личности: %d", anon.Code)
	}
}

func TestLogsContainNeitherPasswordNorLogin(t *testing.T) {
	e := setup(t)
	e.login("student.mo", "Secret-Wrong-1", "10.0.0.1")
	e.login("student.mo", studentPass, "10.0.0.1")
	logs := e.logs.String()
	for _, secret := range []string{"Secret-Wrong-1", studentPass, "student.mo"} {
		if strings.Contains(logs, secret) {
			t.Errorf("в логах найдено %q", secret)
		}
	}
	if !strings.Contains(logs, "login_failed") || !strings.Contains(logs, "login_success") {
		t.Errorf("события безопасности должны попадать в журнал: %s", logs)
	}
}

// Список сеансов и «выйти на всех других устройствах»: только свои сеансы, текущий остаётся.
func TestSessionsListAndEndOthers(t *testing.T) {
	e := setup(t)
	loginFrom := func(ua string) string {
		body, _ := json.Marshal(map[string]string{"login": "student.mo", "password": studentPass})
		r := httptest.NewRequest(http.MethodPost, "/login", bytes.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("User-Agent", ua)
		w := httptest.NewRecorder()
		e.pub.ServeHTTP(w, r)
		return sessionToken(t, w)
	}
	desktop := loginFrom("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
	phone := loginFrom("Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1")
	staff := sessionToken(t, e.login("dekanat.mo", staffPass, "10.0.0.2"))
	e.clock = e.clock.Add(time.Minute)
	if v := e.verify(phone); v.Code != http.StatusNoContent { // телефон — самый недавно активный
		t.Fatalf("verify: %d", v.Code)
	}

	as := func(method, path, token string) *httptest.ResponseRecorder {
		r := platformtest.As(httptest.NewRequest(method, path, nil), platformtest.Student(studentID))
		if token != "" {
			r.AddCookie(&http.Cookie{Name: app.CookieName, Value: token})
		}
		w := httptest.NewRecorder()
		e.pub.ServeHTTP(w, r)
		return w
	}
	w := as(http.MethodGet, "/me/sessions", desktop)
	var list struct {
		Items []struct {
			Device  string `json:"device"`
			Current bool   `json:"current"`
		} `json:"items"`
	}
	must(t, json.Unmarshal(w.Body.Bytes(), &list))
	want := []string{"Safari · iPhone", "Chrome · Windows (текущий)"}
	got := make([]string, 0, len(list.Items))
	for _, s := range list.Items {
		if s.Current {
			s.Device += " (текущий)"
		}
		got = append(got, s.Device)
	}
	if strings.Join(got, "|") != strings.Join(want, "|") {
		t.Fatalf("сеансы: %v, ожидалось %v (сеанс сотрудника в списке студента быть не должен)", got, want)
	}

	if w := as(http.MethodDelete, "/me/sessions/others", ""); w.Code != http.StatusUnauthorized {
		t.Fatalf("без cookie текущий сеанс не определить — нельзя завершать: %d", w.Code)
	}
	w = as(http.MethodDelete, "/me/sessions/others", desktop)
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"ended":1`) {
		t.Fatalf("завершение других сеансов: %d %s", w.Code, w.Body)
	}
	for token, code := range map[string]int{phone: http.StatusUnauthorized, desktop: http.StatusNoContent, staff: http.StatusNoContent} {
		if v := e.verify(token); v.Code != code {
			t.Fatalf("после завершения: verify %d, ожидалось %d", v.Code, code)
		}
	}

	anon := httptest.NewRecorder()
	e.pub.ServeHTTP(anon, httptest.NewRequest(http.MethodGet, "/me/sessions", nil))
	if anon.Code != http.StatusUnauthorized {
		t.Fatalf("без личности: %d", anon.Code)
	}
}
