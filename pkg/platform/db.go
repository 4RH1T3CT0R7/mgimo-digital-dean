package platform

import (
	"context"
	"fmt"
	"io/fs"
	"log/slog"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
)

// OpenDB подключается к PostgreSQL. Если база ещё не готова (перезапуск, сеть), ждёт до ~30 секунд,
// а не падает сразу. Подключает пинг БД к /healthz (ReadinessCheck).
func OpenDB(ctx context.Context, url string) (*pgxpool.Pool, error) {
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		return nil, fmt.Errorf("подключение к БД: %w", err)
	}
	for attempt := 1; ; attempt++ {
		err = pool.Ping(ctx)
		if err == nil {
			break
		}
		if attempt == 30 {
			pool.Close()
			return nil, fmt.Errorf("проверка БД: %w", err)
		}
		slog.Warn("db_not_ready", "attempt", attempt)
		select {
		case <-ctx.Done():
			pool.Close()
			return nil, ctx.Err()
		case <-time.After(time.Second):
		}
	}
	ReadinessCheck = pool.Ping
	return pool, nil
}

// Migrate применяет миграции goose из встроенной файловой системы сервиса (каталог migrations/).
func Migrate(ctx context.Context, pool *pgxpool.Pool, migrations fs.FS) error {
	db := stdlib.OpenDBFromPool(pool)
	defer db.Close()
	provider, err := goose.NewProvider(goose.DialectPostgres, db, migrations)
	if err != nil {
		return fmt.Errorf("миграции: %w", err)
	}
	if _, err := provider.Up(ctx); err != nil {
		return fmt.Errorf("миграции: %w", err)
	}
	return nil
}

// NewLogger — JSON-логгер сервиса в stdout.
func NewLogger(service string) *slog.Logger {
	return slog.New(slog.NewJSONHandler(os.Stdout, nil)).With("service", service)
}

// MustEnv — обязательная переменная окружения; без неё сервис не стартует.
func MustEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		fmt.Fprintf(os.Stderr, "не задана переменная окружения %s\n", key)
		os.Exit(1)
	}
	return v
}
