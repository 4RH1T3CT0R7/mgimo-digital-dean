package events_test

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/events"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/platform/platformtest"
)

func connect(t *testing.T) *events.Bus {
	t.Helper()
	b, err := events.Connect(context.Background(), platformtest.NewNATS(t), slog.New(slog.NewTextHandler(io.Discard, nil)))
	if err != nil {
		t.Fatal(err)
	}
	b.RetryDelay = 50 * time.Millisecond
	t.Cleanup(b.Close)
	return b
}

func lesson() events.LessonChanged {
	room := "Главный корпус, 3047"
	return events.LessonChanged{
		LessonID: uuid.New(), FacultyID: uuid.New(), GroupIDs: []uuid.UUID{uuid.New(), uuid.New()},
		DisciplineName: "История дипломатии", ChangeType: "moved",
		Previous: events.LessonSlot{Date: "2026-11-17", StartTime: "10:30", EndTime: "11:50"},
		Current:  events.LessonSlot{Date: "2026-11-19", StartTime: "12:00", EndTime: "13:20", Room: &room},
	}
}

func waitFor(t *testing.T, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for !cond() {
		if time.Now().After(deadline) {
			t.Fatal("не дождались")
		}
		time.Sleep(20 * time.Millisecond)
	}
}

func TestPublishSubscribeKeepsAllFields(t *testing.T) {
	b := connect(t)
	ctx := context.Background()
	got := make(chan events.Envelope[events.LessonChanged], 1)
	stop, err := events.Subscribe(ctx, b, "test", func(_ context.Context, e events.Envelope[events.LessonChanged]) error {
		got <- e
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	defer stop()

	sent := lesson()
	if err := events.Publish(ctx, b, sent); err != nil {
		t.Fatal(err)
	}
	select {
	case e := <-got:
		if e.Type != events.SubjectLessonChanged || e.ID == uuid.Nil || e.OccurredAt.IsZero() {
			t.Fatalf("конверт: %+v", e)
		}
		if e.Data.LessonID != sent.LessonID || len(e.Data.GroupIDs) != 2 || *e.Data.Current.Room != *sent.Current.Room {
			t.Fatalf("данные изменились при доставке: %+v", e.Data)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("событие не доставлено")
	}
}

func TestDuplicateIDIsDeliveredOnce(t *testing.T) {
	b := connect(t)
	ctx := context.Background()
	var calls atomic.Int32
	stop, err := events.Subscribe(ctx, b, "test", func(context.Context, events.Envelope[events.LessonChanged]) error {
		calls.Add(1)
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	defer stop()

	id, data := uuid.New(), lesson()
	for i := 0; i < 2; i++ {
		if err := events.PublishWithID(ctx, b, id, data); err != nil {
			t.Fatal(err)
		}
	}
	other := lesson() // контрольное событие: когда оно пришло, дубль точно успел бы прийти раньше
	if err := events.Publish(ctx, b, other); err != nil {
		t.Fatal(err)
	}
	waitFor(t, func() bool { return calls.Load() >= 2 })
	time.Sleep(200 * time.Millisecond)
	if n := calls.Load(); n != 2 {
		t.Fatalf("ждали 2 доставки (событие + контрольное), получили %d — дубль не отброшен", n)
	}
}

func TestHandlerErrorCausesRedelivery(t *testing.T) {
	b := connect(t)
	ctx := context.Background()
	var calls atomic.Int32
	stop, err := events.Subscribe(ctx, b, "test", func(context.Context, events.Envelope[events.ApplicationStatusChanged]) error {
		if calls.Add(1) == 1 {
			return errors.New("временная ошибка")
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	defer stop()

	if err := events.Publish(ctx, b, events.ApplicationStatusChanged{ApplicationID: uuid.New(), NewStatus: "ready"}); err != nil {
		t.Fatal(err)
	}
	waitFor(t, func() bool { return calls.Load() >= 2 })
}

func TestSubscribersOfDifferentEventsDoNotMix(t *testing.T) {
	b := connect(t)
	ctx := context.Background()
	var lessons, statuses atomic.Int32
	s1, err := events.Subscribe(ctx, b, "test", func(context.Context, events.Envelope[events.LessonChanged]) error {
		lessons.Add(1)
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	defer s1()
	s2, err := events.Subscribe(ctx, b, "test", func(context.Context, events.Envelope[events.ApplicationStatusChanged]) error {
		statuses.Add(1)
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	defer s2()

	_ = events.Publish(ctx, b, lesson())
	_ = events.Publish(ctx, b, events.ApplicationStatusChanged{ApplicationID: uuid.New(), NewStatus: "in_progress"})
	waitFor(t, func() bool { return lessons.Load() == 1 && statuses.Load() == 1 })
}
