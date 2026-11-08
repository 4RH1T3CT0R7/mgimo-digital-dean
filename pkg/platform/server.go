// Package platform — общий код сервисов: запуск HTTP-серверов, проверка здоровья.
// Остальное (конфиг, логгер, БД, middleware личности, ошибки) добавляется в T02.
package platform

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"golang.org/x/sync/errgroup"
)

const (
	PublicAddr   = ":8080" // публичный API, его проксирует шлюз
	InternalAddr = ":8081" // внутренний API, шлюз его НЕ проксирует (D31)
)

// ReadinessCheck — дополнительная проверка для /healthz: OpenDB подставляет сюда пинг БД.
// Так healthcheck в compose и внешний мониторинг видят не только «процесс жив», но и «работает с БД».
var ReadinessCheck func(ctx context.Context) error

// Healthz отвечает 200, если сервис готов, и 503, если не проходит ReadinessCheck.
func Healthz(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if ReadinessCheck != nil {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		if err := ReadinessCheck(ctx); err != nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			_, _ = w.Write([]byte(`{"status":"unavailable"}`))
			return
		}
	}
	_, _ = w.Write([]byte(`{"status":"ok"}`))
}

// HealthcheckFromArgs обрабатывает флаг `-healthcheck`: в distroless-образе нет curl,
// поэтому бинарник сам проверяет свой /healthz и завершается с кодом 0 или 1.
func HealthcheckFromArgs() {
	if len(os.Args) < 2 || os.Args[1] != "-healthcheck" {
		return
	}
	client := http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get("http://127.0.0.1" + PublicAddr + "/healthz")
	if err != nil || resp.StatusCode != http.StatusOK {
		os.Exit(1)
	}
	os.Exit(0)
}

// Run запускает публичный и внутренний серверы и корректно останавливает их по SIGINT/SIGTERM.
func Run(service string, public, internal http.Handler) error {
	log := slog.New(slog.NewJSONHandler(os.Stdout, nil)).With("service", service)
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// Таймауты — защита от медленных клиентов (slowloris), которые держат соединения открытыми.
	// WriteTimeout с запасом на отдачу файлов до 5 МБ.
	newServer := func(addr string, h http.Handler) *http.Server {
		return &http.Server{Addr: addr, Handler: h, ReadHeaderTimeout: 5 * time.Second,
			ReadTimeout: 30 * time.Second, WriteTimeout: 60 * time.Second, IdleTimeout: 120 * time.Second}
	}
	servers := []*http.Server{newServer(PublicAddr, public), newServer(InternalAddr, internal)}
	g, gctx := errgroup.WithContext(ctx)
	for _, s := range servers {
		g.Go(func() error {
			log.Info("listening", "addr", s.Addr)
			if err := s.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
				return fmt.Errorf("%s: %w", s.Addr, err)
			}
			return nil
		})
	}
	g.Go(func() error {
		<-gctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		for _, s := range servers {
			_ = s.Shutdown(shutdownCtx)
		}
		return nil
	})
	return g.Wait()
}

// HealthOnlyMux — мультиплексор только с /healthz; заглушка до реализации сервиса.
func HealthOnlyMux() *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", Healthz)
	return mux
}
