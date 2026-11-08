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

// Healthz отвечает 200 — для healthcheck в compose.
func Healthz(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
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

	servers := []*http.Server{
		{Addr: PublicAddr, Handler: public, ReadHeaderTimeout: 5 * time.Second},
		{Addr: InternalAddr, Handler: internal, ReadHeaderTimeout: 5 * time.Second},
	}
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
