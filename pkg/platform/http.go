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
// личность из заголовков шлюза, доступ к исходному запросу (cookie, IP) из хендлеров strict-server.
func Middleware(log *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		reqID := r.Header.Get("X-Request-Id")
		if reqID == "" {
			reqID = newRequestID()
		}
		w.Header().Set("X-Request-Id", reqID)

		l := log.With("request_id", reqID)
		ctx := context.WithValue(r.Context(), ctxLogger, l)
		if id, ok := IdentityFromHeaders(r.Header); ok {
			ctx = withIdentity(ctx, id)
			l = l.With("user_id", id.UserID.String())
		}
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
		next.ServeHTTP(rec, r)
	})
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
