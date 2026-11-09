package app_test

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"testing"
	"time"
	"unicode/utf8"

	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/platform"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/platform/platformtest"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/academic/internal/api"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/academic/internal/app"
)

func TestPersonalRoutesRequireStudent(t *testing.T) {
	e := setupPublic(t)
	missingStudent := platformtest.Student(unknown)
	for _, path := range []string{"/me/profile", "/me/schedule", "/me/schedule.ics", "/me/grades/current", "/me/grades/summary", "/me/grades/sessions"} {
		assertError(t, e.do("GET", path, nil, nil), 401, "unauthenticated")
		for _, identity := range []platform.Identity{asStaff1, asAdmin} {
			assertError(t, e.do("GET", path, &identity, nil), 403, "forbidden")
		}
		assertError(t, e.do("GET", path, &missingStudent, nil), 404, "not_found")
	}
	assertError(t, e.do("GET", "/faculties", nil, nil), 401, "unauthenticated")
	assertError(t, e.do("GET", "/staff/groups", &asS1, nil), 403, "forbidden")
	assertError(t, e.do("GET", "/staff/lessons?group_id="+g1.String(), &asS1, nil), 403, "forbidden")
}

func TestInclusiveRangeAndEmptyResponses(t *testing.T) {
	e := setupPublic(t)
	// 31 день включительно разрешён, 32 — нет.
	decode[api.Schedule](t, e.do("GET", "/me/schedule?from=2026-11-01&to=2026-12-01", &asS1, nil))
	assertError(t, e.do("GET", "/me/schedule?from=2026-11-01&to=2026-12-02", &asS1, nil), 400, "validation_failed")
	empty := decode[api.Schedule](t, e.do("GET", "/me/schedule?from=2026-12-01&to=2026-12-07", &asS1, nil))
	if empty.Lessons == nil || len(empty.Lessons) != 0 || empty.Weeks == nil {
		t.Fatalf("пустое расписание должно содержать массивы: %+v", empty)
	}
	p := decode[api.Profile](t, e.do("GET", "/me/profile?student_id="+s2.String(), &asS1, nil))
	if p.Id != s1 {
		t.Fatal("ID из URL заменил личность")
	}
	other := decode[api.CurrentGrades](t, e.do("GET", "/me/grades/current", &asS2, nil))
	if other.Disciplines == nil || len(other.Disciplines) != 0 {
		t.Fatalf("оценки S1 попали к S2: %+v", other)
	}
}

func TestInvalidChangeDoesNotWrite(t *testing.T) {
	e := setupPublic(t)
	end := "25:00"
	reverseStart, reverseEnd := "13:20", "12:00"
	for _, change := range []api.LessonChangeRequest{
		{Type: "invalid"},
		{Type: api.LessonChangeTypeRoomChanged},
		{Type: api.LessonChangeTypeRoomChanged, NewRoom: &api.Room{Building: " ", Number: "3047"}},
		{Type: api.LessonChangeTypeMoved, NewEndTime: &end},
		{Type: api.LessonChangeTypeMoved, NewStartTime: &reverseStart, NewEndTime: &reverseEnd},
		{Type: api.LessonChangeTypeCancelled, Reason: textPointer(strings.Repeat("я", 301))},
	} {
		assertError(t, e.do("POST", "/staff/lessons/"+lessonID.String()+"/change", &asStaff1, change), 400, "validation_failed")
	}
	var status string
	if err := e.pool.QueryRow(context.Background(), "SELECT status FROM lessons WHERE id=$1", lessonID).Scan(&status); err != nil || status != "scheduled" {
		t.Fatalf("неверный запрос изменил запись: %s, %v", status, err)
	}
}

func textPointer(v string) *string {
	return &v
}

func TestPreviousNullRoomSurvivesLaterChange(t *testing.T) {
	e := setupPublic(t)
	execSQL(t, e.pool, "UPDATE lessons SET room_building=NULL, room_number=NULL WHERE id='"+lessonID.String()+"'")
	path := "/staff/lessons/" + lessonID.String() + "/change"
	first := decode[api.Lesson](t, e.do("POST", path, &asStaff1, moveRequest()))
	second := decode[api.Lesson](t, e.do("POST", path, &asStaff1,
		api.LessonChangeRequest{Type: api.LessonChangeTypeRoomChanged, NewRoom: &api.Room{Building: "Главный корпус", Number: "3047"}}))
	if first.Change.Previous.Room != nil || second.Change.Previous.Room != nil || second.Change.Previous.Date.String() != "2026-11-17" {
		t.Fatal("NULL исходной аудитории подменён новым значением")
	}
}

func TestPublicationFailureDoesNotUndoChange(t *testing.T) {
	e := setupPublic(t)
	bus := newBus(t)
	bus.Close()
	clock := time.Date(2026, 11, 18, 10, 0, 0, 0, time.UTC)
	srv := app.New(e.pool, slog.New(slog.NewTextHandler(io.Discard, nil)), func() time.Time { return clock }, bus)
	e.pub, _ = srv.Handlers()
	lesson := decode[api.Lesson](t, e.do("POST", "/staff/lessons/"+lessonID.String()+"/change", &asStaff1, moveRequest()))
	if lesson.Status != api.LessonStatusMoved {
		t.Fatalf("изменение не вернулось после сбоя публикации: %+v", lesson)
	}
	var date string
	if err := e.pool.QueryRow(context.Background(), "SELECT to_char(date, 'YYYY-MM-DD') FROM lessons WHERE id=$1", lessonID).Scan(&date); err != nil || date != "2026-11-19" {
		t.Fatalf("коммит потерян после сбоя NATS: %s, %v", date, err)
	}
}

func TestICSFoldingAndEscaping(t *testing.T) {
	e := setupPublic(t)
	title := strings.Repeat("Международные отношения ", 8) + ", семинар;\r\nBEGIN:VEVENT"
	if _, err := e.pool.Exec(context.Background(), "UPDATE disciplines SET name=$1", title); err != nil {
		t.Fatal(err)
	}
	w := e.do(http.MethodGet, "/me/schedule.ics?from=2026-11-16&to=2026-11-22", &asS1, nil)
	if w.Code != 200 {
		t.Fatalf("экспорт: %d %s", w.Code, w.Body)
	}
	data := w.Body.String()
	for _, line := range strings.Split(data, "\r\n") {
		if !utf8.ValidString(line) || len(line) > 75 {
			t.Fatalf("неверная строка RFC 5545: %q", line)
		}
	}
	unfolded := strings.ReplaceAll(data, "\r\n ", "")
	if !strings.Contains(unfolded, `\, семинар\;\nBEGIN:VEVENT`) || strings.Count(unfolded, "\r\nBEGIN:VEVENT\r\n") != 5 {
		t.Fatal("не экранированы разделители либо добавилось внедрённое событие")
	}
	if !strings.Contains(w.Header().Get("Content-Disposition"), "mgimo-schedule.ics") {
		t.Fatal("нет имени файла")
	}
}
