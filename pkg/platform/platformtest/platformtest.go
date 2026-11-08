// Package platformtest — помощники для тестов сервисов (см. docs/tasks/README.md §7).
package platformtest

import (
	"context"
	"encoding/json"
	"io/fs"
	"net/http"
	"os"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/platform"
)

// NewDB создаёт отдельную базу на тест из TEST_DATABASE_URL, применяет миграции и удаляет базу после теста.
// Без TEST_DATABASE_URL тест пропускается, а при REQUIRE_DB_TESTS=1 (так в CI) — падает.
func NewDB(t testing.TB, migrations fs.FS) *pgxpool.Pool {
	t.Helper()
	base := os.Getenv("TEST_DATABASE_URL")
	if base == "" {
		if os.Getenv("REQUIRE_DB_TESTS") == "1" {
			t.Fatal("TEST_DATABASE_URL не задан, а REQUIRE_DB_TESTS=1: тесты с БД обязательны")
		}
		t.Skip("TEST_DATABASE_URL не задан — тест с БД пропущен (в CI выполняется обязательно)")
	}
	ctx := context.Background()
	admin, err := pgx.Connect(ctx, base)
	if err != nil {
		t.Fatalf("подключение к тестовой БД: %v", err)
	}
	name := "test_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	if _, err := admin.Exec(ctx, "CREATE DATABASE "+name); err != nil {
		t.Fatalf("создание тестовой базы: %v", err)
	}
	cfg, err := pgxpool.ParseConfig(base)
	if err != nil {
		t.Fatal(err)
	}
	cfg.ConnConfig.Database = name
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		pool.Close()
		_, _ = admin.Exec(ctx, "DROP DATABASE "+name+" WITH (FORCE)")
		_ = admin.Close(ctx)
	})
	if err := platform.Migrate(ctx, pool, migrations); err != nil {
		t.Fatalf("миграции: %v", err)
	}
	return pool
}

// Student, Staff, Admin — личности для тестовых запросов.
func Student(id uuid.UUID) platform.Identity {
	return platform.Identity{UserID: id, Role: platform.RoleStudent}
}

func Staff(id, faculty uuid.UUID) platform.Identity {
	return platform.Identity{UserID: id, Role: platform.RoleStaff, FacultyID: &faculty}
}

func Admin(id uuid.UUID) platform.Identity {
	return platform.Identity{UserID: id, Role: platform.RoleAdmin}
}

// As выставляет запросу заголовки личности — так, как это делает шлюз.
func As(r *http.Request, id platform.Identity) *http.Request {
	platform.SetIdentityHeaders(r.Header, id)
	return r
}

// ErrorBody — тело ошибки в формате контракта.
type ErrorBody struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Details struct {
		Fields map[string]string `json:"fields"`
	} `json:"details"`
}

// DecodeError разбирает тело ответа-ошибки.
func DecodeError(t testing.TB, body []byte) ErrorBody {
	t.Helper()
	var e ErrorBody
	if err := json.Unmarshal(body, &e); err != nil {
		t.Fatalf("тело ошибки не JSON: %v; тело: %s", err, body)
	}
	return e
}
