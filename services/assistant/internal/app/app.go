// Package app — ИИ-помощник «Спроси деканат» (T25, I5). Без своей БД.
// В LLM уходит только текст вопроса и выдержки из справочника — без данных профиля (security.md).
package app

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"

	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/platform"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/assistant/internal/api"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/assistant/internal/faq"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/assistant/internal/llm"
)

const (
	MaxQuestionsPerHour = 20
	minQuestion         = 3
	maxQuestion         = 500
)

const systemPrompt = `Ты — помощник деканата в учебном прототипе личного кабинета студента.
Отвечай по-русски, кратко (2–5 предложений) и только по выдержкам из справочника, которые пришлют вместе с вопросом.
Если в выдержках нет ответа — так и скажи и предложи задать вопрос в деканат через заявку «Вопрос в деканат».
Не придумывай номера приказов, сроки, суммы и адреса, которых нет в выдержках.
Не проси и не используй персональные данные.`

const notFoundAnswer = "В справочнике нет ответа на этот вопрос. Задайте его деканату — ответ придёт в заявке «Вопрос в деканат»."

type Server struct {
	entries []faq.Entry
	llm     *llm.Client // nil — только справочник
	log     *slog.Logger
	now     func() time.Time

	mu    sync.Mutex
	asked map[uuid.UUID][]time.Time
}

func New(entries []faq.Entry, client *llm.Client, log *slog.Logger, now func() time.Time) *Server {
	return &Server{entries: entries, llm: client, log: log, now: now, asked: map[uuid.UUID][]time.Time{}}
}

func (s *Server) Handlers() (public, internal http.Handler) {
	pub := api.HandlerWithOptions(api.NewStrictHandlerWithOptions(s, nil, api.StrictHTTPServerOptions{
		RequestErrorHandlerFunc:  platform.RequestErrorHandler,
		ResponseErrorHandlerFunc: platform.ResponseErrorHandler,
	}), api.StdHTTPServerOptions{BaseRouter: platform.NewMux(), ErrorHandlerFunc: platform.RequestErrorHandler})
	return platform.Middleware(s.log, pub), platform.Middleware(s.log, platform.NewMux())
}

func (s *Server) Ask(ctx context.Context, req api.AskRequestObject) (api.AskResponseObject, error) {
	me, err := platform.RequireStudent(ctx)
	if err != nil {
		return nil, err
	}
	if req.Body == nil {
		return nil, platform.Validation(nil)
	}
	question := strings.TrimSpace(req.Body.Question)
	if n := utf8.RuneCountInString(question); n < minQuestion || n > maxQuestion {
		return nil, platform.Validation(map[string]string{"question": fmt.Sprintf("Вопрос — от %d до %d символов", minQuestion, maxQuestion)})
	}
	if wait := s.allow(me.UserID); wait > 0 {
		return nil, platform.TooManyAttempts(int(wait.Seconds()) + 1)
	}

	found := faq.Search(s.entries, question, 3)
	answer := api.Ask200JSONResponse{Provider: api.Faq, Sources: sources(found)}
	switch {
	case len(found) == 0:
		answer.Answer = notFoundAnswer
		answer.SuggestedAction = suggest("dean-question", map[string]string{"question": question})
	default:
		answer.Answer = found[0].Answer
		if found[0].Service != "" {
			answer.SuggestedAction = suggest(found[0].Service, map[string]string{})
		}
		if s.llm != nil {
			if text, err := s.llm.Complete(ctx, systemPrompt, userPrompt(question, found)); err == nil {
				answer.Answer, answer.Provider = text, api.Llm
			} else {
				platform.Log(ctx).Warn("assistant_llm_failed", "error", err.Error()) // запасной ответ — из справочника
			}
		}
	}
	// В лог — только длина вопроса и провайдер: сам текст может содержать что угодно (security.md §3)
	platform.Log(ctx).Info("assistant_answer", "question_len", utf8.RuneCountInString(question),
		"provider", string(answer.Provider), "sources", len(found))
	return answer, nil
}

// allow — лимит вопросов в час на пользователя; возвращает, сколько ждать, если лимит исчерпан.
// ponytail: в памяти одной копии сервиса; при нескольких копиях — счётчик в общей БД.
func (s *Server) allow(user uuid.UUID) time.Duration {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := s.now()
	recent := s.asked[user][:0]
	for _, t := range s.asked[user] {
		if now.Sub(t) < time.Hour {
			recent = append(recent, t)
		}
	}
	if len(recent) >= MaxQuestionsPerHour {
		s.asked[user] = recent
		return time.Hour - now.Sub(recent[0])
	}
	s.asked[user] = append(recent, now)
	return 0
}

func userPrompt(question string, found []faq.Entry) string {
	var b strings.Builder
	b.WriteString("Вопрос студента: ")
	b.WriteString(question)
	b.WriteString("\n\nВыдержки из справочника:\n")
	for i, e := range found {
		fmt.Fprintf(&b, "[%d] %s\n%s\n\n", i+1, e.Question, e.Answer)
	}
	return b.String()
}

func sources(found []faq.Entry) []struct {
	FaqId string `json:"faq_id"`
	Title string `json:"title"`
} {
	out := make([]struct {
		FaqId string `json:"faq_id"`
		Title string `json:"title"`
	}, 0, len(found))
	for _, e := range found {
		out = append(out, struct {
			FaqId string `json:"faq_id"`
			Title string `json:"title"`
		}{e.ID, e.Question})
	}
	return out
}

func suggest(service string, prefill map[string]string) *struct {
	Prefill       map[string]string `json:"prefill"`
	ServiceTypeId string            `json:"service_type_id"`
} {
	return &struct {
		Prefill       map[string]string `json:"prefill"`
		ServiceTypeId string            `json:"service_type_id"`
	}{Prefill: prefill, ServiceTypeId: service}
}
