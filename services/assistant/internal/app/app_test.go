package app_test

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/platform"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/platform/platformtest"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/assistant/internal/api"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/assistant/internal/app"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/assistant/internal/faq"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/assistant/internal/llm"
)

var (
	student = uuid.MustParse("30000000-0000-4000-8000-000000000001")
	entries = faq.Parse(`## academic-leave: Как оформить академический отпуск?
Подайте заявление «Академический отпуск» в кабинете.
Услуга: academic-leave
`)
)

type env struct {
	pub   http.Handler
	clock time.Time
	logs  *bytes.Buffer
}

func setup(t *testing.T, client *llm.Client) *env {
	e := &env{clock: time.Date(2026, 11, 18, 10, 0, 0, 0, time.UTC), logs: &bytes.Buffer{}}
	srv := app.New(entries, client, slog.New(slog.NewJSONHandler(e.logs, nil)), func() time.Time { return e.clock })
	e.pub, _ = srv.Handlers()
	return e
}

func (e *env) ask(id *platform.Identity, question string) *httptest.ResponseRecorder {
	body, _ := json.Marshal(map[string]string{"question": question})
	r := httptest.NewRequest(http.MethodPost, "/ask", bytes.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	if id != nil {
		platformtest.As(r, *id)
	}
	w := httptest.NewRecorder()
	e.pub.ServeHTTP(w, r)
	return w
}

func decode(t *testing.T, w *httptest.ResponseRecorder) api.Answer {
	t.Helper()
	if w.Code != http.StatusOK {
		t.Fatalf("код %d: %s", w.Code, w.Body)
	}
	var a api.Answer
	if err := json.Unmarshal(w.Body.Bytes(), &a); err != nil {
		t.Fatal(err)
	}
	return a
}

var asStudent = platformtest.Student(student)

func TestAnswerFromFAQWithoutLLM(t *testing.T) {
	e := setup(t, nil)
	a := decode(t, e.ask(&asStudent, "Как уйти в академ?"))
	if a.Provider != api.Faq || !strings.Contains(a.Answer, "Академический отпуск") || len(a.Sources) != 1 {
		t.Fatalf("ответ: %+v", a)
	}
	if a.SuggestedAction == nil || a.SuggestedAction.ServiceTypeId != "academic-leave" {
		t.Fatalf("должно быть предложение открыть форму академ. отпуска: %+v", a.SuggestedAction)
	}
}

func TestUnknownQuestionSuggestsDeanQuestion(t *testing.T) {
	e := setup(t, nil)
	a := decode(t, e.ask(&asStudent, "Какая погода завтра?"))
	if len(a.Sources) != 0 || a.SuggestedAction == nil || a.SuggestedAction.ServiceTypeId != "dean-question" ||
		a.SuggestedAction.Prefill["question"] != "Какая погода завтра?" {
		t.Fatalf("ждали предложение «Вопрос в деканат» с текстом вопроса: %+v", a)
	}
}

func TestAccessAndValidation(t *testing.T) {
	e := setup(t, nil)
	staff := platformtest.Staff(uuid.New(), uuid.New())
	cases := []struct {
		name string
		id   *platform.Identity
		q    string
		want int
	}{
		{"без входа", nil, "Как уйти в академ?", 401},
		{"сотрудник", &staff, "Как уйти в академ?", 403},
		{"слишком короткий", &asStudent, "ау", 400},
		{"слишком длинный", &asStudent, strings.Repeat("я", 501), 400},
		{"ровно 500 символов", &asStudent, strings.Repeat("я", 500), 200},
	}
	for _, c := range cases {
		if w := e.ask(c.id, c.q); w.Code != c.want {
			t.Errorf("%s: %d, ждали %d", c.name, w.Code, c.want)
		}
	}
}

func TestLLMAnswerAndWhatIsSent(t *testing.T) {
	var got struct {
		auth string
		body string
	}
	fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		got.auth, got.body = r.Header.Get("Authorization"), string(b)
		_, _ = w.Write([]byte(`{"choices":[{"message":{"role":"assistant","content":"Подайте заявление в кабинете."}}]}`))
	}))
	defer fake.Close()
	e := setup(t, llm.New(fake.URL, "secret-key", "Api-Key", "yandexgpt-lite", 2*time.Second))

	a := decode(t, e.ask(&asStudent, "Как уйти в академ?"))
	if a.Provider != api.Llm || a.Answer != "Подайте заявление в кабинете." {
		t.Fatalf("ответ LLM: %+v", a)
	}
	if got.auth != "Api-Key secret-key" {
		t.Errorf("заголовок авторизации: %q", got.auth)
	}
	if !strings.Contains(got.body, "Как уйти в академ?") || !strings.Contains(got.body, "Академический отпуск") {
		t.Errorf("в LLM должны уйти вопрос и выдержка: %s", got.body)
	}
	if strings.Contains(got.body, student.String()) {
		t.Error("в LLM не должны уходить данные студента")
	}
	if strings.Contains(e.logs.String(), "Как уйти в академ") || strings.Contains(e.logs.String(), "secret-key") {
		t.Error("в логах не должно быть текста вопроса и ключа")
	}
}

func TestLLMFailureFallsBackToFAQ(t *testing.T) {
	slow := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(300 * time.Millisecond)
	}))
	defer slow.Close()
	broken := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer broken.Close()

	for name, client := range map[string]*llm.Client{
		"тайм-аут":   llm.New(slow.URL, "k", "", "m", 50*time.Millisecond),
		"ошибка 500": llm.New(broken.URL, "k", "", "m", time.Second),
	} {
		a := decode(t, setup(t, client).ask(&asStudent, "Как уйти в академ?"))
		if a.Provider != api.Faq || !strings.Contains(a.Answer, "Академический отпуск") {
			t.Errorf("%s: ждали ответ из справочника, получили %+v", name, a)
		}
	}
}

func TestRateLimit(t *testing.T) {
	e := setup(t, nil)
	for i := 0; i < app.MaxQuestionsPerHour; i++ {
		if w := e.ask(&asStudent, "Как уйти в академ?"); w.Code != 200 {
			t.Fatalf("вопрос %d: %d", i+1, w.Code)
		}
	}
	w := e.ask(&asStudent, "Как уйти в академ?")
	if w.Code != http.StatusTooManyRequests || w.Header().Get("Retry-After") == "" {
		t.Fatalf("21-й вопрос: %d %v", w.Code, w.Header())
	}
	other := platformtest.Student(uuid.New())
	if w := e.ask(&other, "Как уйти в академ?"); w.Code != 200 {
		t.Fatalf("лимит общий для всех, а должен быть на пользователя: %d", w.Code)
	}
	e.clock = e.clock.Add(time.Hour + time.Minute)
	if w := e.ask(&asStudent, "Как уйти в академ?"); w.Code != 200 {
		t.Fatalf("через час лимит должен сброситься: %d", w.Code)
	}
}
