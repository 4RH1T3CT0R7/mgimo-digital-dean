package app_test

import (
	"context"
	"io"
	"log/slog"
	"reflect"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/events"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/platform/platformtest"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/academic/internal/api"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/academic/internal/app"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/academic/internal/calendar"
)

func TestEventsUseImmediatePreviousForEveryChange(t *testing.T) {
	e := setupPublic(t)
	bus := newBus(t)
	srv := app.New(e.pool, slog.New(slog.NewTextHandler(io.Discard, nil)),
		func() time.Time { return time.Date(2026, 11, 18, 10, 0, 0, 0, calendar.Moscow) }, bus)
	e.pub, _ = srv.Handlers()
	received := make(chan events.LessonChanged, 4)
	stop, err := events.Subscribe(context.Background(), bus, "review-chain", func(_ context.Context, ev events.Envelope[events.LessonChanged]) error {
		received <- ev.Data
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	defer stop()
	firstMove, secondMove := moveRequest(), moveRequest()
	secondMove.NewDate.Time = time.Date(2026, 11, 20, 0, 0, 0, 0, calendar.Moscow)
	room := "Главный корпус, 2105"
	previous := events.LessonSlot{Date: "2026-11-17", StartTime: "10:30", EndTime: "11:50", Room: &room}
	for _, request := range []api.LessonChangeRequest{firstMove, secondMove,
		{Type: api.LessonChangeTypeRoomChanged, NewRoom: &api.Room{Building: "Главный корпус", Number: "3047"}},
		{Type: api.LessonChangeTypeCancelled}} {
		lesson := decode[api.Lesson](t, e.do("POST", "/staff/lessons/"+lessonID.String()+"/change", &asStaff1, request))
		if lesson.Change.Previous.Date.String() != "2026-11-17" || lesson.Change.Previous.Room.Number != "2105" {
			t.Fatalf("исходный слот API потерян: %+v", lesson.Change.Previous)
		}
		select {
		case event := <-received:
			currentRoom := lesson.Room.Building + ", " + lesson.Room.Number
			current := events.LessonSlot{Date: lesson.Date.String(), StartTime: lesson.StartTime, EndTime: lesson.EndTime, Room: &currentRoom}
			if event.ChangeType != string(request.Type) || !reflect.DeepEqual(event.Previous, previous) || !reflect.DeepEqual(event.Current, current) {
				t.Fatalf("%s: previous=%+v, want=%+v; current=%+v", request.Type, event.Previous, previous, event.Current)
			}
			previous = current
		case <-time.After(5 * time.Second):
			t.Fatal("не пришло событие изменения")
		}
	}
}

func TestRoomLengthLimitsUseCharactersAndFieldErrors(t *testing.T) {
	e := setupPublic(t)
	path := "/staff/lessons/" + lessonID.String() + "/change"
	for _, field := range []string{"building", "number"} {
		room := &api.Room{Building: "Главный корпус", Number: "3047"}
		if field == "building" {
			room.Building = strings.Repeat("я", 101)
		} else {
			room.Number = strings.Repeat("я", 101)
		}
		response := e.do("POST", path, &asStaff1, api.LessonChangeRequest{Type: api.LessonChangeTypeRoomChanged, NewRoom: room})
		assertError(t, response, 400, "validation_failed")
		if platformtest.DecodeError(t, response.Body.Bytes()).Details.Fields["new_room."+field] == "" {
			t.Fatalf("нет ошибки конкретного поля %s", field)
		}
	}
	decode[api.Lesson](t, e.do("POST", path, &asStaff1, api.LessonChangeRequest{Type: api.LessonChangeTypeRoomChanged,
		NewRoom: &api.Room{Building: strings.Repeat("я", 100), Number: strings.Repeat("я", 100)}}))
}

func TestReversedCalendarPeriodReturnsEmptyCalendar(t *testing.T) {
	e := setupPublic(t)
	w := e.do("GET", "/me/schedule.ics?from=2026-11-20&to=2026-11-18", &asS1, nil)
	if w.Code != 200 || !strings.Contains(w.Body.String(), "BEGIN:VCALENDAR\r\n") || strings.Contains(w.Body.String(), "BEGIN:VEVENT") {
		t.Fatalf("обратный период должен вернуть пустой календарь: %d %s", w.Code, w.Body)
	}
}

type groupQueryTrace struct {
	count atomic.Int32
}

func (trace *groupQueryTrace) TraceQueryStart(ctx context.Context, _ *pgx.Conn, data pgx.TraceQueryStartData) context.Context {
	if strings.Contains(data.SQL, "-- name: ListLessonGroups") {
		trace.count.Add(1)
	}
	return ctx
}

func (*groupQueryTrace) TraceQueryEnd(context.Context, *pgx.Conn, pgx.TraceQueryEndData) {}

func TestSchedulesAndReplayLoadGroupsInOneQuery(t *testing.T) {
	e := setupPublic(t)
	trace := &groupQueryTrace{}
	config := e.pool.Config()
	config.ConnConfig.Tracer = trace
	pool, err := pgxpool.NewWithConfig(context.Background(), config)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	traced := newEnv(pool)
	for _, path := range []string{"/me/schedule", "/me/schedule.ics", "/staff/lessons?group_id=" + g1.String()} {
		identity := &asS1
		if strings.HasPrefix(path, "/staff") {
			identity = &asStaff1
		}
		trace.count.Store(0)
		if response := traced.do("GET", path, identity, nil); response.Code != 200 {
			t.Fatalf("%s: %d %s", path, response.Code, response.Body)
		}
		if count := trace.count.Load(); count != 1 {
			t.Fatalf("%s: запросов групп %d, ожидался один", path, count)
		}
	}
	bus := newBus(t)
	srv := app.New(pool, slog.New(slog.NewTextHandler(io.Discard, nil)), time.Now, bus)
	trace.count.Store(0)
	if _, err := srv.ReplaySeedEvents(context.Background()); err != nil {
		t.Fatal(err)
	}
	if count := trace.count.Load(); count != 1 {
		t.Fatalf("replay: запросов групп %d, ожидался один", count)
	}
}
