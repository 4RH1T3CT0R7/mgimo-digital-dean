package app

import (
	"context"
	"testing"
	"time"

	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/events"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/platform/platformtest"
	"github.com/google/uuid"
	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
)

func TestE1E2LessonFanout(t *testing.T) {
	e := setup(t)
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	url := platformtest.NewNATS(t)
	bus, err := events.Connect(ctx, url, testLog)
	if err != nil {
		t.Fatal(err)
	}
	defer bus.Close()
	stop, err := e.s.Subscribe(ctx, bus)
	if err != nil {
		t.Fatal(err)
	}
	defer stop()
	nc, err := nats.Connect(url)
	if err != nil {
		t.Fatal(err)
	}
	defer nc.Close()
	js, err := jetstream.New(nc)
	if err != nil {
		t.Fatal(err)
	}
	stream, err := js.Stream(ctx, events.StreamName)
	if err != nil {
		t.Fatal(err)
	}
	info, err := stream.Info(ctx)
	if err != nil {
		t.Fatal(err)
	}
	info.Config.Duplicates = 100 * time.Millisecond
	if _, err := js.UpdateStream(ctx, info.Config); err != nil {
		t.Fatal(err)
	}
	consumer, err := stream.Consumer(ctx, "notifications-academic-lesson-changed")
	if err != nil {
		t.Fatal(err)
	}
	id := uuid.New()
	data := events.LessonChanged{LessonID: uuid.New(), FacultyID: f1, GroupIDs: []uuid.UUID{g1, g2}, DisciplineName: "История дипломатии", ChangeType: "moved",
		Previous: events.LessonSlot{Date: "2026-11-17", StartTime: "10:30"}, Current: events.LessonSlot{Date: "2026-11-19", StartTime: "12:00"}}
	check := func(sequence uint64) {
		t.Helper()
		for {
			info, err := consumer.Info(ctx)
			if err != nil {
				t.Fatal(err)
			}
			if info.AckFloor.Stream >= sequence {
				break
			}
			select {
			case <-ctx.Done():
				t.Fatal("обработка события не завершилась")
			case <-time.After(20 * time.Millisecond):
			}
		}
		var found int
		err := e.s.pool.QueryRow(ctx, `SELECT count(DISTINCT audience_group_id) FROM notifications WHERE source_event_id=$1 AND audience_kind='group'`, id).Scan(&found)
		if err != nil || found != 2 {
			t.Fatalf("адресаты = %d, ошибка %v", found, err)
		}
		if err := e.s.pool.QueryRow(ctx, `SELECT count(*) FROM notifications WHERE source_event_id=$1`, id).Scan(&found); err != nil || found != 2 {
			t.Fatalf("уведомления = %d, ошибка %v", found, err)
		}
	}
	if err := events.PublishWithID(ctx, bus, id, data); err != nil {
		t.Fatal(err)
	}
	check(1)

	// Истечение окна позволяет повтору снова дойти до потребителя.
	// Проверяем дедупликацию в БД, а не фильтр публикаций JetStream.
	select {
	case <-time.After(200 * time.Millisecond):
	case <-ctx.Done():
		t.Fatal(ctx.Err())
	}
	if err := events.PublishWithID(ctx, bus, id, data); err != nil {
		t.Fatal(err)
	}
	check(2)
}
