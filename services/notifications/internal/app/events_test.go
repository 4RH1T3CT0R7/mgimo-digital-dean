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

func TestE1E2Redelivery(t *testing.T) {
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
	lastSeq := func() uint64 {
		t.Helper()
		info, err := stream.Info(ctx)
		if err != nil {
			t.Fatal(err)
		}
		return info.State.LastSeq
	}
	// publish отправляет событие и ждёт, пока потребитель подтвердит именно это сообщение.
	publish := func(consumerName string, send func() error) {
		t.Helper()
		before := lastSeq()
		if err := send(); err != nil {
			t.Fatal(err)
		}
		seq := lastSeq()
		if seq != before+1 {
			t.Fatal("JetStream отбросил повтор при публикации: дедупликация в БД не проверена")
		}
		consumer, err := stream.Consumer(ctx, consumerName)
		if err != nil {
			t.Fatal(err)
		}
		for {
			info, err := consumer.Info(ctx)
			if err != nil {
				t.Fatal(err)
			}
			if info.AckFloor.Stream >= seq {
				return
			}
			select {
			case <-ctx.Done():
				t.Fatal("обработка события не завершилась")
			case <-time.After(20 * time.Millisecond):
			}
		}
	}
	// Истечение окна позволяет повтору снова дойти до потребителя.
	// Проверяем дедупликацию в БД, а не фильтр публикаций JetStream.
	waitWindow := func() {
		select {
		case <-time.After(200 * time.Millisecond):
		case <-ctx.Done():
			t.Fatal(ctx.Err())
		}
	}
	count := func(query string, id uuid.UUID) int {
		t.Helper()
		var n int
		if err := e.s.pool.QueryRow(ctx, query, id).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}
	const (
		byEvent  = `SELECT count(*) FROM notifications WHERE source_event_id=$1`
		byGroups = `SELECT count(DISTINCT audience_group_id) FROM notifications WHERE source_event_id=$1 AND audience_kind='group'`
	)

	lessonID := uuid.New()
	lesson := events.LessonChanged{LessonID: uuid.New(), FacultyID: f1, GroupIDs: []uuid.UUID{g1, g2}, DisciplineName: "История дипломатии", ChangeType: "moved",
		Previous: events.LessonSlot{Date: "2026-11-17", StartTime: "10:30"}, Current: events.LessonSlot{Date: "2026-11-19", StartTime: "12:00"}}
	for range 2 {
		publish("notifications-academic-lesson-changed", func() error { return events.PublishWithID(ctx, bus, lessonID, lesson) })
		if groups, total := count(byGroups, lessonID), count(byEvent, lessonID); groups != 2 || total != 2 {
			t.Fatalf("адресаты = %d, уведомления = %d", groups, total)
		}
		waitWindow()
	}

	// Личное событие: адресат user, группа NULL. Повтор с тем же id не создаёт вторую строку.
	statusID := uuid.New()
	status := events.ApplicationStatusChanged{ApplicationID: uuid.New(), Number: "000123", StudentID: s1, FacultyID: f1,
		ServiceTypeID: "military-certificate", ServiceTitle: "Справка в военкомат", NewStatus: "in_progress"}
	for range 2 {
		publish("notifications-requests-application-status_changed", func() error { return events.PublishWithID(ctx, bus, statusID, status) })
		if total := count(byEvent, statusID); total != 1 {
			t.Fatalf("личных уведомлений = %d", total)
		}
		waitWindow()
	}
}
