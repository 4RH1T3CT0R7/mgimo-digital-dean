package app_test

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/events"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/platform/platformtest"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/requests/internal/api"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/requests/internal/app"
)

// Проигрывание событий по данным в БД (T07): история статусов и ответы деканата превращаются
// в события с одинаковыми ID при каждом запуске — уведомления не задваиваются.
func TestReplaySeedEvents(t *testing.T) {
	quiet := slog.New(slog.NewTextHandler(io.Discard, nil))
	e := setup(t, nil) // данные создаём без шины: события «из жизни» тут не нужны

	// Справка: подана сразу в ready (история: ready). Выписка: submitted → in_progress + ответ деканата.
	e.create(asA, "study-certificate", map[string]string{"purpose": "По месту требования"})
	q := e.create(asA, "transcript", nil)
	expect(t, e.do(http.MethodPost, "/staff/applications/"+q.Id.String()+"/status", &asStaffMO,
		api.StatusChangeRequest{Status: api.InProgress}), http.StatusOK)
	expect(t, e.do(http.MethodPost, "/staff/applications/"+q.Id.String()+"/messages", &asStaffMO,
		api.MessageRequest{Text: "Пересдача 20.11"}), http.StatusCreated)

	bus, err := events.Connect(context.Background(), platformtest.NewNATS(t), quiet)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(bus.Close)

	var mu sync.Mutex
	statuses := map[uuid.UUID][]events.ApplicationStatusChanged{}
	var messages []events.ApplicationMessageAdded
	stop1, _ := events.Subscribe(context.Background(), bus, "test", func(_ context.Context, ev events.Envelope[events.ApplicationStatusChanged]) error {
		mu.Lock()
		defer mu.Unlock()
		statuses[ev.ID] = append(statuses[ev.ID], ev.Data)
		return nil
	})
	defer stop1()
	stop2, _ := events.Subscribe(context.Background(), bus, "test", func(_ context.Context, ev events.Envelope[events.ApplicationMessageAdded]) error {
		mu.Lock()
		defer mu.Unlock()
		messages = append(messages, ev.Data)
		return nil
	})
	defer stop2()

	srv := app.New(e.pool, quiet, func() time.Time { return e.clock }, bus, nil, "")
	n, err := srv.ReplaySeedEvents(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	// История: справка — ready (1); выписка — submitted, in_progress (2). Сообщение деканата — 1.
	if n != 4 {
		t.Fatalf("опубликовано %d событий, ждали 4", n)
	}
	waitUntil(t, func() bool { mu.Lock(); defer mu.Unlock(); return len(statuses) == 3 && len(messages) == 1 })

	mu.Lock()
	var question []events.ApplicationStatusChanged
	for _, list := range statuses {
		if list[0].ApplicationID == q.Id {
			question = append(question, list[0])
		}
	}
	mu.Unlock()
	if len(question) != 2 {
		t.Fatalf("у выписки должно быть 2 перехода, получили %d", len(question))
	}
	for _, ev := range question {
		if ev.NewStatus == "in_progress" && (ev.OldStatus == nil || *ev.OldStatus != "submitted") {
			t.Errorf("переход в in_progress должен идти из submitted: %+v", ev)
		}
		if ev.NewStatus == "submitted" && ev.OldStatus != nil {
			t.Errorf("первый статус — без old_status: %+v", ev)
		}
	}
	if messages[0].AuthorRole != "staff" || messages[0].AuthorLabel != "Деканат ФМО" || messages[0].ApplicationID != q.Id {
		t.Errorf("событие сообщения: %+v", messages[0])
	}

	// Повторный запуск: те же ID событий (дубли JetStream отбросит; notifications отбросит по source_event_id).
	if _, err := srv.ReplaySeedEvents(context.Background()); err != nil {
		t.Fatal(err)
	}
	time.Sleep(300 * time.Millisecond)
	mu.Lock()
	defer mu.Unlock()
	if len(statuses) != 3 || len(messages) != 1 {
		t.Fatalf("повторный запуск не должен давать новых событий: статусов %d, сообщений %d", len(statuses), len(messages))
	}
}

func waitUntil(t *testing.T, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for !cond() {
		if time.Now().After(deadline) {
			t.Fatal("не дождались событий")
		}
		time.Sleep(20 * time.Millisecond)
	}
}
