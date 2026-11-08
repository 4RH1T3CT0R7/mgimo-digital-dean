package platformtest

import (
	"testing"
	"time"

	"github.com/nats-io/nats-server/v2/server"
)

// NewNATS запускает встроенный NATS с JetStream на случайном порту и возвращает его адрес.
// Подключение: events.Connect(ctx, platformtest.NewNATS(t), logger).
func NewNATS(t testing.TB) string {
	t.Helper()
	s, err := server.NewServer(&server.Options{
		Host:      "127.0.0.1",
		Port:      -1, // случайный свободный порт
		JetStream: true,
		StoreDir:  t.TempDir(),
		NoLog:     true,
		NoSigs:    true,
	})
	if err != nil {
		t.Fatalf("nats: %v", err)
	}
	go s.Start()
	if !s.ReadyForConnections(10 * time.Second) {
		t.Fatal("nats не запустился")
	}
	t.Cleanup(s.Shutdown)
	return s.ClientURL()
}
