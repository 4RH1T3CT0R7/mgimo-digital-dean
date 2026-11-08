package platform

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"log/slog"
	"net"
	"net/http"
	"net/netip"
	"strings"
	"time"
)

type ctxKey int

const (
	ctxIdentity ctxKey = iota
	ctxLogger
	ctxRequest
)

// Middleware — общая обёртка каждого сервера сервиса: request id, лог запроса, recover,
// проверка Content-Type, личность из заголовков шлюза, доступ к исходному запросу (cookie, IP)
// из хендлеров strict-server.
func Middleware(log *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		reqID := sanitizeRequestID(r.Header.Get("X-Request-Id"))
		w.Header().Set("X-Request-Id", reqID)

		l := log.With("request_id", reqID)
		ctx := r.Context()
		if id, ok := IdentityFromHeaders(r.Header); ok {
			ctx = withIdentity(ctx, id)
			l = l.With("user_id", id.UserID.String())
		}
		ctx = context.WithValue(ctx, ctxLogger, l) // после user_id: он должен быть в логах хендлеров
		r = r.WithContext(ctx)
		ctx = context.WithValue(ctx, ctxRequest, r)
		r = r.WithContext(ctx)

		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		defer func() {
			if p := recover(); p != nil {
				l.Error("panic", "panic", p)
				WriteError(rec, Internal())
			}
			// В лог — только метод, путь и статус: без query-параметров и тел (там могут быть ПДн).
			if r.URL.Path != "/healthz" {
				l.Info("request", "method", r.Method, "path", r.URL.Path, "status", rec.status,
					"duration_ms", time.Since(start).Milliseconds())
			}
		}()

		// Ответы API содержат личные данные — браузер и прокси не должны их кэшировать (security.md, 152-ФЗ).
		w.Header().Set("Cache-Control", "no-store")

		if !allowedBody(r) {
			WriteError(rec, &Error{Status: http.StatusUnsupportedMediaType, Code: "unsupported_media_type",
				Message: "Запрос должен быть в формате JSON"})
			return
		}
		// JSON-тело — не больше MaxJSONBody: защита памяти сервиса от огромных запросов.
		// Файлы (multipart) ограничивают сами обработчики загрузки.
		if isJSON(r) {
			if r.ContentLength > MaxJSONBody {
				WriteError(rec, &Error{Status: http.StatusRequestEntityTooLarge, Code: "payload_too_large",
					Message: "Слишком большой запрос"})
				return
			}
			r.Body = http.MaxBytesReader(rec, r.Body, MaxJSONBody)
		}
		next.ServeHTTP(rec, r)
	})
}

// MaxJSONBody — предел JSON-тела запроса (1 МБ: самое длинное поле по контрактам — 4000 символов).
const MaxJSONBody = 1 << 20

func isJSON(r *http.Request) bool {
	ct := strings.ToLower(strings.TrimSpace(strings.SplitN(r.Header.Get("Content-Type"), ";", 2)[0]))
	return ct == "application/json"
}

// allowedBody — запросы, меняющие данные, принимают тело только в JSON или multipart (файлы).
// Простые формы с чужого сайта (text/plain, x-www-form-urlencoded) так не пройдут — защита от CSRF
// в дополнение к SameSite у cookie (security.md §3).
func allowedBody(r *http.Request) bool {
	switch r.Method {
	case http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete:
	default:
		return true
	}
	if r.ContentLength == 0 && len(r.TransferEncoding) == 0 {
		return true // тела нет (например, POST /logout)
	}
	ct := strings.ToLower(strings.TrimSpace(strings.SplitN(r.Header.Get("Content-Type"), ";", 2)[0]))
	return ct == "application/json" || ct == "multipart/form-data"
}

// sanitizeRequestID — свой ID из заголовка, только если он короткий и безопасный, иначе новый.
func sanitizeRequestID(v string) string {
	if v == "" || len(v) > 64 {
		return newRequestID()
	}
	for _, c := range v {
		if !(c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '-' || c == '_') {
			return newRequestID()
		}
	}
	return v
}

// Log — логгер запроса (с request_id и user_id). Вне запроса — логгер по умолчанию.
func Log(ctx context.Context) *slog.Logger {
	if l, ok := ctx.Value(ctxLogger).(*slog.Logger); ok {
		return l
	}
	return slog.Default()
}

// RequestFrom — исходный http.Request: нужен хендлерам strict-server для cookie и IP.
func RequestFrom(ctx context.Context) *http.Request {
	r, _ := ctx.Value(ctxRequest).(*http.Request)
	return r
}

// ClientIP — адрес клиента. За шлюзом это последний адрес в X-Forwarded-For (его выставляет Caddy).
func ClientIP(r *http.Request) (netip.Addr, bool) {
	if r == nil {
		return netip.Addr{}, false
	}
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		if a, err := netip.ParseAddr(strings.TrimSpace(parts[len(parts)-1])); err == nil {
			return a, true
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	a, err := netip.ParseAddr(host)
	return a, err == nil
}

// NewMux — мультиплексор с /healthz и JSON-ответом 404 на неизвестные пути.
// Передаётся как BaseRouter в сгенерированный HandlerWithOptions.
func NewMux() *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", Healthz)
	mux.HandleFunc("/", func(w http.ResponseWriter, _ *http.Request) { WriteError(w, NotFound()) })
	return mux
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}

func newRequestID() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
