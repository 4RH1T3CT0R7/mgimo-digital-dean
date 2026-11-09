package app_test

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"reflect"
	"testing"
	"time"

	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/events"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/academic/internal/api"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/academic/internal/app"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/academic/internal/calendar"
)

func TestCancellationAfterMovePublishesActualSlotAndReplaysIt(t *testing.T) {
	e := setupPublic(t)
	path := "/staff/lessons/" + lessonID.String() + "/change"
	decode[api.Lesson](t, e.do(http.MethodPost, path, &asStaff1, moveRequest()))
	decode[api.Lesson](t, e.do(http.MethodPost, path, &asStaff1, api.LessonChangeRequest{
		Type: api.LessonChangeTypeRoomChanged, NewRoom: &api.Room{Building: "Главный корпус", Number: "3047"},
	}))

	bus := newBus(t)
	srv := app.New(e.pool, slog.New(slog.NewTextHandler(io.Discard, nil)),
		func() time.Time { return time.Date(2026, 11, 18, 10, 0, 0, 0, calendar.Moscow) }, bus)
	e.pub, _ = srv.Handlers()
	received := make(chan events.LessonChanged, 8)
	stop, err := events.Subscribe(context.Background(), bus, "cancel-after-move", func(_ context.Context, ev events.Envelope[events.LessonChanged]) error {
		received <- ev.Data

		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	defer stop()

	cancelled := decode[api.Lesson](t, e.do(http.MethodPost, path, &asStaff1, api.LessonChangeRequest{Type: api.LessonChangeTypeCancelled}))
	if cancelled.Date.String() != "2026-11-19" || cancelled.Change == nil || cancelled.Change.Previous.Date.String() != "2026-11-17" {
		t.Fatalf("ответ API потерял текущий либо исходный слот: %+v", cancelled)
	}
	wantRoom := "Главный корпус, 3047"
	want := events.LessonSlot{Date: "2026-11-19", StartTime: "12:00", EndTime: "13:20", Room: &wantRoom}
	assertEvent := func(stage string) {
		t.Helper()
		deadline := time.After(5 * time.Second)
		for {
			select {
			case event := <-received:
				if event.LessonID != lessonID {
					continue
				}
				if event.ChangeType != "cancelled" || !reflect.DeepEqual(event.Previous, want) || !reflect.DeepEqual(event.Current, want) {
					t.Fatalf("%s: неверный слот уведомления: %+v", stage, event)
				}

				return
			case <-deadline:
				t.Fatalf("%s: событие отмены не пришло", stage)
			}
		}
	}
	assertEvent("live")
	if _, err := srv.ReplaySeedEvents(context.Background()); err != nil {
		t.Fatal(err)
	}
	assertEvent("replay")
}
