package app_test

import (
	"net/http"
	"slices"
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/academic/internal/api"
)

// Сессия поверх publicFixture: экзамен и консультация группы S1, зачёт её языковой группы,
// экзамен чужой группы, отменённый экзамен и контрольная точка S2. Периоды вставлены не по порядку.
const calendarFixture = `
UPDATE terms SET end_date = '2027-01-24';
INSERT INTO term_periods (term_id, kind, start_date, end_date) VALUES
('12000000-0000-4000-8000-000000000001', 'session', '2027-01-11', '2027-01-24'),
('12000000-0000-4000-8000-000000000001', 'study', '2026-09-01', '2026-12-20'),
('12000000-0000-4000-8000-000000000001', 'credit_week', '2026-12-21', '2026-12-27');
INSERT INTO lessons (id, discipline_id, kind, format, date, start_time, end_time,
                     pair_number, room_building, room_number, status, updated_at)
SELECT ('61000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, '51000000-0000-4000-8000-000000000001',
       kind, 'offline', date::date, start_time::time, end_time::time, pair, 'Корпус Б', '1047', status, now()
FROM (VALUES
    (1, 'exam', '2027-01-12', '09:00', '13:20', 1, 'scheduled'),
    (2, 'credit', '2026-12-22', '12:00', '13:20', 3, 'scheduled'),
    (3, 'exam', '2027-01-13', '09:00', '13:20', 1, 'scheduled'),
    (4, 'exam', '2027-01-14', '09:00', '13:20', 1, 'cancelled'),
    (5, 'consultation', '2027-01-11', '12:00', '13:20', 3, 'scheduled')
) AS slots(n, kind, date, start_time, end_time, pair, status);
INSERT INTO lesson_groups (lesson_id, group_id) VALUES
('61000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001'),
('61000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002'),
('61000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000004'),
('61000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001'),
('61000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000001');
INSERT INTO student_disciplines (id, student_id, discipline_id, semester, academic_year, term,
                                control_form, hours, credits, updated_at)
VALUES ('70000000-0000-4000-8000-000000000008', '30000000-0000-4000-8000-000000000002',
        '51000000-0000-4000-8000-000000000001', 3, '2026/2027', 'autumn', 'exam', 108, 3, now());
INSERT INTO control_points (id, student_id, discipline_id, semester, date, title, score, max) VALUES
('71000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002',
 '51000000-0000-4000-8000-000000000001', 3, '2026-12-01', 'Коллоквиум', NULL, 30);
`

func eventIDs(events []api.AcademicEvent) []string {
	ids := make([]string, 0, len(events))
	for _, event := range events {
		ids = append(ids, event.Id.String())
	}

	return ids
}

func TestAcademicCalendarOnlyOwnEvents(t *testing.T) {
	e := setupPublic(t)
	execSQL(t, e.pool, calendarFixture)

	mine := decode[api.AcademicCalendar](t, e.do(http.MethodGet, "/me/academic-calendar", &asS1, nil))
	kinds := make([]api.TermPeriodKind, 0, len(mine.Periods))
	for _, period := range mine.Periods {
		kinds = append(kinds, period.Kind)
	}
	if !slices.Equal(kinds, []api.TermPeriodKind{api.Study, api.CreditWeek, api.Session}) {
		t.Fatalf("периоды не по порядку: %v", kinds)
	}
	if mine.Term.EndDate.String() != "2027-01-24" || mine.Term.Term != api.AcademicCalendarTermTermAutumn {
		t.Fatalf("семестр: %+v", mine.Term)
	}
	// Контрольная точка S1, зачёт языковой группы, консультация и экзамен академической — по дате.
	// Без обычных пар, отменённого экзамена, чужой группы и контрольной точки S2.
	want := []string{"71000000-0000-4000-8000-000000000001", "61000000-0000-4000-8000-000000000002",
		"61000000-0000-4000-8000-000000000005", "61000000-0000-4000-8000-000000000001"}
	if got := eventIDs(mine.Events); !slices.Equal(got, want) {
		t.Fatalf("события S1: %v, ожидались %v", got, want)
	}
	point, exam := mine.Events[0], mine.Events[3]
	if point.Kind != api.AcademicEventKindControlPoint || point.StartTime != nil || point.Title == nil || *point.Title != "Контрольная работа" ||
		point.Discipline.Name != "История дипломатии" || point.Room != nil {
		t.Fatalf("контрольная точка: %+v", point)
	}
	if exam.Kind != api.AcademicEventKindExam || exam.StartTime == nil || *exam.StartTime != "09:00" || *exam.EndTime != "13:20" ||
		exam.Room == nil || exam.Room.Number != "1047" || exam.Title != nil || exam.Date.String() != "2027-01-12" {
		t.Fatalf("экзамен: %+v", exam)
	}

	other := decode[api.AcademicCalendar](t, e.do(http.MethodGet, "/me/academic-calendar", &asS2, nil))
	if got := eventIDs(other.Events); !slices.Equal(got, []string{"71000000-0000-4000-8000-000000000002", "61000000-0000-4000-8000-000000000003"}) {
		t.Fatalf("события S2: %v", got)
	}
}

func TestICSContainsControlPointsAndExams(t *testing.T) {
	e := setupPublic(t)
	execSQL(t, e.pool, calendarFixture)

	w := e.do(http.MethodGet, "/me/schedule.ics?from=2026-11-01&to=2027-01-31", &asS1, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("экспорт: %d %s", w.Code, w.Body)
	}
	data := strings.ReplaceAll(w.Body.String(), "\r\n ", "")
	for _, want := range []string{
		"UID:71000000-0000-4000-8000-000000000001\r\nDTSTAMP:20261118T070000Z\r\nDTSTART;VALUE=DATE:20261110\r\nDTEND;VALUE=DATE:20261111\r\n" +
			"SUMMARY:Контрольная работа: История дипломатии\r\n",
		"DTSTART;TZID=Europe/Moscow:20270112T090000\r\nDTEND;TZID=Europe/Moscow:20270112T132000\r\nSUMMARY:Экзамен: История дипломатии\r\n",
		"SUMMARY:Зачёт: История дипломатии\r\n",
		"SUMMARY:Консультация: История дипломатии\r\n",
	} {
		if !strings.Contains(data, want) {
			t.Fatalf("в .ics нет %q", want)
		}
	}
	for _, id := range []uuid.UUID{uuid.MustParse("61000000-0000-4000-8000-000000000003"), uuid.MustParse("61000000-0000-4000-8000-000000000004"),
		uuid.MustParse("71000000-0000-4000-8000-000000000002")} {
		if strings.Contains(data, id.String()) {
			t.Fatalf("в .ics чужое или отменённое событие %s", id)
		}
	}

	// Без параметров — до конца семестра, то есть до конца сессии: январский экзамен попадает в файл.
	byDefault := e.do(http.MethodGet, "/me/schedule.ics", &asS1, nil).Body.String()
	if !strings.Contains(byDefault, "UID:61000000-0000-4000-8000-000000000001\r\n") || strings.Contains(byDefault, "VALUE=DATE:20261110") {
		t.Fatal("выгрузка по умолчанию не до конца сессии или включает прошедшие контрольные точки")
	}
}
