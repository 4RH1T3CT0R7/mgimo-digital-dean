package app_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"

	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/events"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/platform"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/platform/platformtest"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/academic/internal/api"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/academic/internal/app"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/academic/internal/calendar"
)

var (
	asS1        = platformtest.Student(s1)
	asS2        = platformtest.Student(s2)
	asStaff1    = platformtest.Staff(uuid.MustParse("40000000-0000-4000-8000-000000000001"), f1)
	asStaff2    = platformtest.Staff(uuid.MustParse("40000000-0000-4000-8000-000000000002"), f2)
	asAdmin     = platformtest.Admin(uuid.MustParse("40000000-0000-4000-8000-000000000003"))
	lessonID    = uuid.MustParse("60000000-0000-4000-8000-000000000001")
	movedID     = uuid.MustParse("60000000-0000-4000-8000-000000000005")
	cancelledID = uuid.MustParse("60000000-0000-4000-8000-000000000006")
)

const publicFixture = `
INSERT INTO terms (id, academic_year, term, start_date, end_date, is_current)
VALUES ('12000000-0000-4000-8000-000000000001', '2026/2027', 'autumn', '2026-09-01', '2026-12-27', true);
INSERT INTO disciplines (id, name) VALUES
('51000000-0000-4000-8000-000000000001', 'История дипломатии'),
('51000000-0000-4000-8000-000000000002', 'Английский язык'),
('51000000-0000-4000-8000-000000000003', 'Французский язык');
INSERT INTO teachers (id, full_name, short_name)
VALUES ('52000000-0000-4000-8000-000000000001', 'Орлов Павел Сергеевич', 'Орлов П. С.');
INSERT INTO lessons (id, discipline_id, kind, format, date, start_time, end_time,
                     pair_number, room_building, room_number, teacher_id, status, updated_at)
SELECT ('60000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       '51000000-0000-4000-8000-000000000001', 'seminar', 'offline',
       date::date, start_time::time, end_time::time, pair, 'Главный корпус', '2105',
       '52000000-0000-4000-8000-000000000001', 'scheduled', '2026-11-17 12:00:00+03'::timestamptz
FROM (VALUES
    (1, '2026-11-17', '10:30', '11:50', 2),
    (2, '2026-11-18', '09:00', '10:20', 1),
    (3, '2026-11-19', '14:20', '15:40', 4),
    (4, '2026-11-18', '09:00', '10:20', 1),
    (5, '2026-11-19', '12:00', '13:20', 3),
    (6, '2026-11-20', '10:30', '11:50', 2),
    (7, '2026-11-19', '10:30', '11:50', 2)
) AS slots(n, date, start_time, end_time, pair);
INSERT INTO lesson_groups (lesson_id, group_id) VALUES
('60000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001'),
('60000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002'),
('60000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003'),
('60000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000004'),
('60000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000001'),
('60000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000001'),
('60000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-000000000001');
UPDATE lessons SET prev_date = date, prev_start_time = start_time, prev_end_time = end_time,
    prev_room_building = room_building, prev_room_number = room_number,
    changed_at = '2026-11-17 12:00:00+03'
WHERE id IN ('60000000-0000-4000-8000-000000000005', '60000000-0000-4000-8000-000000000006', '60000000-0000-4000-8000-000000000007');
UPDATE lessons SET status = 'moved', change_type = 'moved', prev_date = '2026-11-17',
    prev_start_time = '10:30', prev_end_time = '11:50'
WHERE id = '60000000-0000-4000-8000-000000000005';
UPDATE lessons SET status = 'cancelled', change_type = 'cancelled', change_reason = 'Болезнь преподавателя'
WHERE id = '60000000-0000-4000-8000-000000000006';
UPDATE lessons SET status = 'changed', change_type = 'room_changed', room_number = '3047'
WHERE id = '60000000-0000-4000-8000-000000000007';
INSERT INTO student_disciplines (id, student_id, discipline_id, semester, academic_year, term,
                                control_form, hours, credits, percent, passed, current_score, max_to_date,
                                attendance_percent, updated_at)
SELECT ('70000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       student::uuid, discipline::uuid, sem, '2025/2026', term, form, 108, 3, percent, passed,
       score, max_to_date, attendance, '2026-11-17 15:00:00+03'::timestamptz
FROM (VALUES
    (1, '30000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', 3, 'autumn', 'exam', NULL::int, NULL::bool, 50, 60, 90),
    (2, '30000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000002', 3, 'autumn', 'exam', NULL, NULL, 40, 60, 90),
    (3, '30000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000003', 3, 'autumn', 'credit', NULL, NULL, 35, 60, 90),
    (4, '30000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', 2, 'spring', 'exam', 90, NULL, NULL, NULL, NULL),
    (5, '30000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000002', 2, 'spring', 'credit', NULL, true, NULL, NULL, NULL),
    (6, '30000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', 1, 'autumn', 'graded_credit', 66, NULL, NULL, NULL, NULL),
    (7, '30000000-0000-4000-8000-000000000002', '51000000-0000-4000-8000-000000000001', 2, 'spring', 'exam', 59, NULL, NULL, NULL, NULL)
) AS grades(n, student, discipline, sem, term, form, percent, passed, score, max_to_date, attendance);
INSERT INTO control_points (id, student_id, discipline_id, semester, date, title, score, max) VALUES
('71000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', 3, '2026-11-10', 'Контрольная работа', 20, 30);
INSERT INTO student_ratings (student_id, semester, percent, percentile) VALUES
('30000000-0000-4000-8000-000000000001', 2, 82.50, 78);
`

func setupPublic(t *testing.T) *env {
	t.Helper()

	e := setup(t)
	execSQL(t, e.pool, publicFixture)

	return e
}

func (e *env) do(method, path string, identity *platform.Identity, body any) *httptest.ResponseRecorder {
	var content io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			panic(err)
		}
		content = bytes.NewReader(data)
	}
	r := httptest.NewRequest(method, path, content)
	if identity != nil {
		platformtest.As(r, *identity)
	}
	if method == http.MethodPost {
		r.Header.Set("Content-Type", "application/json")
	}
	w := httptest.NewRecorder()
	e.pub.ServeHTTP(w, r)

	return w
}

func TestA1Profile(t *testing.T) {
	e := setupPublic(t)
	p := decode[api.Profile](t, e.do(http.MethodGet, "/me/profile", &asS1, nil))
	if p.Id != s1 || p.Faculty.Id != f1 || len(p.LanguageGroups) != 2 || p.StudentCardNo != "2401317" {
		t.Fatalf("неверный профиль: %+v", p)
	}
}

func TestA2ProfileWithoutIdentity(t *testing.T) {
	e := setupPublic(t)
	assertError(t, e.do(http.MethodGet, "/me/profile", nil, nil), 401, "unauthenticated")
}

func TestA3ProfileForStaff(t *testing.T) {
	e := setupPublic(t)
	assertError(t, e.do(http.MethodGet, "/me/profile", &asStaff1, nil), 403, "forbidden")
}

func TestA4ScheduleGroups(t *testing.T) {
	e := setupPublic(t)
	schedule := decode[api.Schedule](t, e.do(http.MethodGet, "/me/schedule?from=2026-11-16&to=2026-11-22", &asS1, nil))
	groups := map[uuid.UUID]bool{}
	for _, lesson := range schedule.Lessons {
		for _, group := range lesson.Groups {
			if group.Id == g2 {
				t.Fatal("чужая группа попала в расписание")
			}
			groups[group.Id] = true
		}
	}
	for _, group := range []uuid.UUID{g1, l1, l2} {
		if !groups[group] {
			t.Errorf("нет группы %s", group)
		}
	}
	if schedule.AsOf.Format(time.RFC3339) != "2026-11-17T12:00:00+03:00" || len(schedule.Weeks) != 1 ||
		schedule.Weeks[0].Number != 12 || schedule.Weeks[0].Parity != api.Even {
		t.Fatalf("неверные as_of/weeks: %+v", schedule)
	}
}

func TestA5ReversedPeriod(t *testing.T) {
	e := setupPublic(t)
	assertError(t, e.do(http.MethodGet, "/me/schedule?from=2026-11-22&to=2026-11-16", &asS1, nil), 400, "validation_failed")
}

func TestA6LongPeriod(t *testing.T) {
	e := setupPublic(t)
	assertError(t, e.do(http.MethodGet, "/me/schedule?from=2026-11-01&to=2026-12-15", &asS1, nil), 400, "validation_failed")
}

func TestA7DefaultWeek(t *testing.T) {
	e := setupPublic(t)
	schedule := decode[api.Schedule](t, e.do(http.MethodGet, "/me/schedule", &asS1, nil))
	if schedule.From.String() != "2026-11-16" || schedule.To.String() != "2026-11-22" {
		t.Fatalf("ожидалась неделя 16–22.11: %+v", schedule)
	}
}

func TestA8MovedAway(t *testing.T) {
	e := setupPublic(t)
	for _, tc := range []struct {
		from  string
		count int
	}{{"2026-11-16", 2}, {"2026-11-18", 1}} {
		schedule := decode[api.Schedule](t, e.do(http.MethodGet, "/me/schedule?from="+tc.from+"&to=2026-11-22", &asS1, nil))
		count := 0
		statuses := map[api.LessonStatus]int{}
		for _, lesson := range schedule.Lessons {
			if lesson.Id != movedID {
				continue
			}
			count++
			statuses[lesson.Status]++
			switch lesson.Status {
			case api.LessonStatusMoved:
				if lesson.Date.String() != "2026-11-19" {
					t.Fatal("неверная новая дата")
				}
			case api.LessonStatusMovedAway:
				if lesson.Date.String() != "2026-11-17" || lesson.MovedTo == nil || lesson.MovedTo.Date.String() != "2026-11-19" || lesson.MovedTo.StartTime != "12:00" {
					t.Fatalf("неверная старая запись: %+v", lesson)
				}
			default:
				t.Fatalf("неверный статус: %s", lesson.Status)
			}
		}
		if count != tc.count {
			t.Fatalf("для %s ожидалось %d записей, получено %d", tc.from, tc.count, count)
		}
		if statuses[api.LessonStatusMoved] != 1 || statuses[api.LessonStatusMovedAway] != tc.count-1 {
			t.Fatalf("для %s неверный набор статусов: %+v", tc.from, statuses)
		}
	}
}

func TestA9CancelledLesson(t *testing.T) {
	e := setupPublic(t)
	schedule := decode[api.Schedule](t, e.do(http.MethodGet, "/me/schedule", &asS1, nil))
	for _, lesson := range schedule.Lessons {
		if lesson.Id == cancelledID {
			if lesson.Status != api.LessonStatusCancelled || lesson.Change == nil || lesson.Change.Previous.StartTime != "10:30" {
				t.Fatalf("неверная отмена: %+v", lesson)
			}

			return
		}
	}
	t.Fatal("отменённое занятие не найдено")
}

func TestA10CalendarExport(t *testing.T) {
	e := setupPublic(t)
	w := e.do(http.MethodGet, "/me/schedule.ics", &asS1, nil)
	if w.Code != 200 || w.Header().Get("Content-Type") != "text/calendar" {
		t.Fatalf("экспорт: %d, %s", w.Code, w.Body)
	}
	data := w.Body.String()
	for _, text := range []string{"BEGIN:VCALENDAR\r\n", "TZID:Europe/Moscow", "UID:" + movedID.String()} {
		if !strings.Contains(data, text) {
			t.Errorf("нет %q", text)
		}
	}
	if strings.Contains(data, "UID:"+cancelledID.String()) || strings.Count(data, "UID:"+movedID.String()) != 1 {
		t.Fatal("отмена или виртуальная запись попала в календарь")
	}
	for _, line := range strings.Split(data, "\r\n") {
		if len(line) > 75 || !utf8.ValidString(line) {
			t.Fatalf("неверный перенос строки ICS: %q", line)
		}
	}
}

func TestA11Debts(t *testing.T) {
	e := setupPublic(t)
	summary := decode[api.GradesSummary](t, e.do(http.MethodGet, "/me/grades/summary", &asS2, nil))
	if summary.DebtsCount != 1 {
		t.Fatalf("ожидался один долг: %+v", summary)
	}
	own := decode[api.GradesSummary](t, e.do(http.MethodGet, "/me/grades/summary", &asS1, nil))
	if own.DebtsCount != 0 || own.Rating == nil || own.Rating.Percent != 82.5 || own.AverageGrade5 == nil || *own.AverageGrade5 != 4 {
		t.Fatalf("неверная сводка S1: %+v", own)
	}
}

func TestA12TrafficOrder(t *testing.T) {
	e := setupPublic(t)
	grades := decode[api.CurrentGrades](t, e.do(http.MethodGet, "/me/grades/current", &asS1, nil))
	if len(grades.Disciplines) != 3 {
		t.Fatalf("получено дисциплин: %d", len(grades.Disciplines))
	}
	for i, traffic := range []api.Traffic{api.Red, api.Yellow, api.Green} {
		if grades.Disciplines[i].Traffic != traffic {
			t.Fatalf("неверный порядок: %+v", grades.Disciplines)
		}
	}
	if len(grades.Disciplines[2].ControlPoints) != 1 || grades.Disciplines[0].TrafficReason == nil {
		t.Fatal("нет контрольной точки или причины риска")
	}
}

func TestA13Sessions(t *testing.T) {
	e := setupPublic(t)
	sessions := decode[api.SessionResults](t, e.do(http.MethodGet, "/me/grades/sessions", &asS1, nil))
	if len(sessions.Semesters) != 2 || sessions.Semesters[0].Semester != 2 || sessions.Semesters[1].Semester != 1 {
		t.Fatalf("неверный порядок семестров: %+v", sessions)
	}
	for _, item := range sessions.Semesters[0].Results {
		if item.ControlForm == api.ControlFormCredit {
			if item.Grade5 != nil || item.Ects != nil || item.Percent != nil || item.Passed == nil || !*item.Passed {
				t.Fatalf("неверный зачёт: %+v", item)
			}
		} else if item.Grade5 == nil || *item.Grade5 != api.Excellent || item.Ects == nil || *item.Ects != api.A {
			t.Fatalf("неверный экзамен: %+v", item)
		}
	}
	item := sessions.Semesters[1].Results[0]
	if item.Grade5 == nil || *item.Grade5 != api.Satisfactory || item.Ects == nil || *item.Ects != api.E {
		t.Fatalf("неверная шкала для 66%%: %+v", item)
	}
}

func TestA14StaffGroups(t *testing.T) {
	e := setupPublic(t)
	for _, tc := range []struct {
		identity *platform.Identity
		query    string
		count    int
		faculty  string
	}{
		{&asStaff1, "?faculty_id=" + f2.String(), 4, "ФМО"},
		{&asAdmin, "", 5, ""}, {&asAdmin, "?faculty_id=" + f2.String(), 1, "МЭО"},
	} {
		groups := decode[[]api.GroupInfo](t, e.do(http.MethodGet, "/staff/groups"+tc.query, tc.identity, nil))
		if len(groups) != tc.count {
			t.Fatalf("получено групп %d, ожидалось %d", len(groups), tc.count)
		}
		for _, group := range groups {
			if tc.faculty != "" && group.FacultyShort != tc.faculty {
				t.Fatalf("чужой факультет: %+v", group)
			}
		}
	}
}

func TestA15StaffLessonsScope(t *testing.T) {
	e := setupPublic(t)
	path := "/staff/lessons?group_id=" + g2.String()
	assertError(t, e.do(http.MethodGet, path, &asStaff1, nil), 404, "not_found")
	lessons := decode[[]api.Lesson](t, e.do(http.MethodGet, path, &asAdmin, nil))
	if len(lessons) != 1 {
		t.Fatalf("неверное расписание admin: %+v", lessons)
	}
}

func TestA16MoveWithoutDate(t *testing.T) {
	e := setupPublic(t)
	w := e.do(http.MethodPost, "/staff/lessons/"+lessonID.String()+"/change", &asStaff1, api.LessonChangeRequest{Type: api.LessonChangeTypeMoved})
	assertError(t, w, 400, "validation_failed")
	if platformtest.DecodeError(t, w.Body.Bytes()).Details.Fields["new_date"] == "" {
		t.Fatal("нет ошибки new_date")
	}
}

func moveRequest() api.LessonChangeRequest {
	request := api.LessonChangeRequest{Type: api.LessonChangeTypeMoved}
	start, end := "12:00", "13:20"
	date := api.Schedule{}.From
	date.Time = time.Date(2026, 11, 19, 0, 0, 0, 0, calendar.Moscow)
	request.NewDate, request.NewStartTime, request.NewEndTime = &date, &start, &end

	return request
}

func TestA17MoveAndPublishAfterCommit(t *testing.T) {
	e := setupPublic(t)
	bus := newBus(t)
	clock := time.Date(2026, 11, 18, 10, 0, 0, 0, calendar.Moscow)
	srv := app.New(e.pool, slog.New(slog.NewTextHandler(io.Discard, nil)), func() time.Time { return clock }, bus)
	e.pub, _ = srv.Handlers()
	received := make(chan events.Envelope[events.LessonChanged], 1)
	stop, err := events.Subscribe(context.Background(), bus, "test", func(ctx context.Context, ev events.Envelope[events.LessonChanged]) error {
		var status string
		if err := e.pool.QueryRow(ctx, "SELECT status FROM lessons WHERE id=$1", ev.Data.LessonID).Scan(&status); err != nil {
			return err
		}
		if status != "moved" {
			return fmt.Errorf("событие до коммита: %s", status)
		}
		received <- ev

		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	defer stop()
	lesson := decode[api.Lesson](t, e.do(http.MethodPost, "/staff/lessons/"+lessonID.String()+"/change", &asStaff1, moveRequest()))
	wantPrevious := api.LessonChange{}.Previous
	wantPrevious.Date.Time = time.Date(2026, 11, 17, 0, 0, 0, 0, time.UTC)
	wantPrevious.StartTime, wantPrevious.EndTime = "10:30", "11:50"
	wantPrevious.Room = &api.Room{Building: "Главный корпус", Number: "2105"}
	if lesson.Status != api.LessonStatusMoved || lesson.Change == nil || !reflect.DeepEqual(lesson.Change.Previous, wantPrevious) ||
		!lesson.Change.ChangedAt.Equal(clock) {
		t.Fatalf("неверный перенос: %+v", lesson)
	}
	select {
	case ev := <-received:
		room := "Главный корпус, 2105"
		previous := events.LessonSlot{Date: "2026-11-17", StartTime: "10:30", EndTime: "11:50", Room: &room}
		current := events.LessonSlot{Date: "2026-11-19", StartTime: "12:00", EndTime: "13:20", Room: &room}
		if ev.Data.LessonID != lessonID || ev.Data.FacultyID != f1 || ev.Data.ChangeType != "moved" ||
			!reflect.DeepEqual(ev.Data.Previous, previous) || !reflect.DeepEqual(ev.Data.Current, current) {
			t.Fatalf("неверное событие: %+v", ev)
		}
		assertIDs(t, ev.Data.GroupIDs, []uuid.UUID{g1})
	case <-time.After(5 * time.Second):
		t.Fatal("событие не пришло после коммита")
	}
}

func TestA18KeepFirstPrevious(t *testing.T) {
	e := setupPublic(t)
	path := "/staff/lessons/" + lessonID.String() + "/change"
	first := decode[api.Lesson](t, e.do(http.MethodPost, path, &asStaff1, moveRequest()))
	second := decode[api.Lesson](t, e.do(http.MethodPost, path, &asStaff1,
		api.LessonChangeRequest{Type: api.LessonChangeTypeRoomChanged, NewRoom: &api.Room{Building: "Главный корпус", Number: "3047"}}))
	if first.Change == nil || second.Change == nil || !reflect.DeepEqual(first.Change.Previous, second.Change.Previous) {
		t.Fatalf("исходные значения потеряны: %+v / %+v", first.Change, second.Change)
	}
	if second.Room == nil || second.Room.Number != "3047" || second.Status != api.LessonStatusMoved {
		t.Fatalf("новая аудитория или перенос потеряны: %+v", second)
	}
}

func TestA19CancelledCannotChange(t *testing.T) {
	e := setupPublic(t)
	assertError(t, e.do(http.MethodPost, "/staff/lessons/"+cancelledID.String()+"/change", &asStaff1, moveRequest()), 409, "conflict")
}

func TestA20OtherFacultyCannotChange(t *testing.T) {
	e := setupPublic(t)
	assertError(t, e.do(http.MethodPost, "/staff/lessons/"+lessonID.String()+"/change", &asStaff2, moveRequest()), 404, "not_found")
}

func TestA21StudentCannotChange(t *testing.T) {
	e := setupPublic(t)
	assertError(t, e.do(http.MethodPost, "/staff/lessons/"+lessonID.String()+"/change", &asS1, moveRequest()), 403, "forbidden")
}

func newBus(t *testing.T) *events.Bus {
	t.Helper()

	bus, err := events.Connect(context.Background(), platformtest.NewNATS(t), slog.New(slog.NewTextHandler(io.Discard, nil)))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(bus.Close)

	return bus
}

func TestConcurrentMovesKeepOriginalSlot(t *testing.T) {
	e := setupPublic(t)
	var wg sync.WaitGroup
	results := make(chan *httptest.ResponseRecorder, 2)
	for _, day := range []int{19, 20} {
		wg.Go(func() {
			move := moveRequest()
			move.NewDate.Time = time.Date(2026, 11, day, 0, 0, 0, 0, calendar.Moscow)
			results <- e.do(http.MethodPost, "/staff/lessons/"+lessonID.String()+"/change", &asStaff1, move)
		})
	}
	wg.Wait()
	close(results)
	for w := range results {
		lesson := decode[api.Lesson](t, w)
		if lesson.Change == nil || lesson.Change.Previous.Date.String() != "2026-11-17" || lesson.Change.Previous.StartTime != "10:30" {
			t.Fatalf("конкурентные изменения потеряли исходный слот: %+v", lesson)
		}
	}
}
