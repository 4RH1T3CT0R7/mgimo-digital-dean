package app_test

import (
	"context"
	"io"
	"log/slog"
	"os"
	"reflect"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/events"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/platform"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/platform/platformtest"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/academic/internal/api"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/academic/internal/app"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/academic/internal/calendar"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/academic/migrations"
)

func TestReplaySeedEventsStableIDs(t *testing.T) {
	e := setupPublic(t)
	bus := newBus(t)
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	srv := app.New(e.pool, logger, func() time.Time { return time.Date(2026, 11, 18, 10, 0, 0, 0, calendar.Moscow) }, bus)
	var mu sync.Mutex
	received := map[uuid.UUID]events.LessonChanged{}
	stop, err := events.Subscribe(context.Background(), bus, "replay-test", func(_ context.Context, ev events.Envelope[events.LessonChanged]) error {
		mu.Lock()
		defer mu.Unlock()
		received[ev.ID] = ev.Data

		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	defer stop()
	n, err := srv.ReplaySeedEvents(context.Background())
	if err != nil || n != 3 {
		t.Fatalf("первый запуск: published=%d, err=%v", n, err)
	}
	deadline := time.After(5 * time.Second)
	ticker := time.NewTicker(10 * time.Millisecond)
	defer ticker.Stop()
	for {
		mu.Lock()
		count := len(received)
		mu.Unlock()
		if count == 3 {
			break
		}
		select {
		case <-deadline:
			t.Fatal("события replay не доставлены")
		case <-ticker.C:
		}
	}
	n, err = srv.ReplaySeedEvents(context.Background())
	if err != nil || n != 3 {
		t.Fatalf("повторный запуск: published=%d, err=%v", n, err)
	}
	select {
	case <-time.After(300 * time.Millisecond):
		mu.Lock()
		defer mu.Unlock()
		if len(received) != 3 {
			t.Fatalf("ID событий изменились при повторе: %d событий", len(received))
		}
		for id, event := range received {
			if id == uuid.Nil || event.FacultyID != f1 || len(event.GroupIDs) != 1 || event.Previous.Date == "" {
				t.Fatalf("неверное событие replay: %s %+v", id, event)
			}
			if event.ChangeType == "cancelled" && !reflect.DeepEqual(event.Previous, event.Current) {
				t.Fatalf("у отмены current не совпадает с previous: %+v", event)
			}
		}
	}
}

func TestFullSeedScheduleAndGrades(t *testing.T) {
	pool := platformtest.NewDB(t, migrations.FS)
	for _, path := range []string{"00_reference.sql", "01_schedule.sql", "02_grades.sql", "03_academic_year.sql"} {
		sql, err := os.ReadFile("../../seed/" + path)
		if err != nil {
			t.Fatal(err)
		}
		execSQL(t, pool, string(sql))
	}
	e := newEnv(pool)
	for _, entry := range []struct {
		identity platform.Identity
		year     int
	}{{asS1, 2025}, {asS2, 2024}} {
		profile := decode[api.Profile](t, e.do("GET", "/me/profile", &entry.identity, nil))
		if profile.EnrollmentYear != entry.year {
			t.Fatalf("год поступления %s: %d вместо %d", entry.identity.UserID, profile.EnrollmentYear, entry.year)
		}
	}
	var stale int
	if err := pool.QueryRow(context.Background(), `SELECT count(*) FROM (
		SELECT updated_at FROM lessons UNION ALL SELECT updated_at FROM student_disciplines
	) dates WHERE updated_at < now() - interval '2 hours' OR updated_at > now()`).Scan(&stale); err != nil || stale != 0 {
		t.Fatalf("seed содержит несвежие даты актуальности: %d, %v", stale, err)
	}
	for _, identity := range []platform.Identity{asS1, asS2} {
		for _, from := range []string{"2026-11-16", "2026-11-23", "2026-11-30"} {
			start, _ := time.Parse(time.DateOnly, from)
			to := start.AddDate(0, 0, 6).Format(time.DateOnly)
			schedule := decode[api.Schedule](t, e.do("GET", "/me/schedule?from="+from+"&to="+to, &identity, nil))
			counts := map[api.LessonStatus]int{}
			for _, lesson := range schedule.Lessons {
				counts[lesson.Status]++
			}
			for _, status := range []api.LessonStatus{api.LessonStatusMoved, api.LessonStatusMovedAway, api.LessonStatusCancelled, api.LessonStatusChanged} {
				if counts[status] < 1 {
					t.Fatalf("у %s за неделю %s нет %s", identity.UserID, from, status)
				}
			}
		}
		grades := decode[api.CurrentGrades](t, e.do("GET", "/me/grades/current", &identity, nil))
		if len(grades.Disciplines) != 6 {
			t.Fatalf("у %s не шесть дисциплин", identity.UserID)
		}
		for _, discipline := range grades.Disciplines {
			if len(discipline.ControlPoints) != 3 {
				t.Fatalf("у %s не три контрольные точки", discipline.Discipline.Id)
			}
		}
	}
	summary := decode[api.GradesSummary](t, e.do("GET", "/me/grades/summary", &asS1, nil))
	if summary.Traffic.Green != 3 || summary.Traffic.Yellow != 2 || summary.Traffic.Red != 1 || summary.DebtsCount != 0 {
		t.Fatalf("seed student.mo: %+v", summary)
	}
	summary2 := decode[api.GradesSummary](t, e.do("GET", "/me/grades/summary", &asS2, nil))
	if summary2.DebtsCount != 1 || summary2.CurrentSemester != 5 || summary2.Traffic.Red < 1 {
		t.Fatalf("seed student.meo: %+v", summary2)
	}
	checkSeedSession(t, e)
}

// Сессия в seed совпадает с дедлайнами notifications/seed/02_deadlines.sql.
func checkSeedSession(t *testing.T, e *env) {
	t.Helper()

	plan := decode[api.AcademicCalendar](t, e.do("GET", "/me/academic-calendar", &asS1, nil))
	kinds := make([]api.TermPeriodKind, 0, len(plan.Periods))
	for _, period := range plan.Periods {
		kinds = append(kinds, period.Kind)
	}
	if !reflect.DeepEqual(kinds, []api.TermPeriodKind{api.Study, api.CreditWeek, api.Holidays, api.Session, api.Vacation}) ||
		plan.Term.EndDate.String() != "2027-01-24" {
		t.Fatalf("календарный план: %v, конец семестра %s", kinds, plan.Term.EndDate)
	}
	found := map[string]bool{}
	for _, event := range plan.Events {
		if event.StartTime != nil && event.Room != nil {
			found[string(event.Kind)+" "+event.Discipline.Name+" "+event.Date.String()+" "+*event.StartTime] = true
		}
	}
	for _, want := range []string{"credit Международное публичное право 2026-12-18 10:30", "credit Английский язык 2026-12-22 12:00",
		"exam Теория международных отношений 2027-01-12 09:00", "consultation Теория международных отношений 2027-01-11 12:00"} {
		if !found[want] {
			t.Fatalf("в календаре student.mo нет %q", want)
		}
	}
	kindsIn := func(from, to string) map[api.LessonKind]int {
		counts := map[api.LessonKind]int{}
		for _, lesson := range decode[api.Schedule](t, e.do("GET", "/me/schedule?from="+from+"&to="+to, &asS1, nil)).Lessons {
			counts[lesson.Kind]++
		}

		return counts
	}
	if got := kindsIn("2026-12-21", "2026-12-27"); !reflect.DeepEqual(got, map[api.LessonKind]int{api.LessonKindCredit: 2}) {
		t.Fatalf("в зачётную неделю только зачёты: %v", got)
	}
	if got := kindsIn("2027-01-11", "2027-01-17"); !reflect.DeepEqual(got, map[api.LessonKind]int{api.LessonKindConsultation: 2, api.LessonKindExam: 2}) {
		t.Fatalf("неделя сессии: %v", got)
	}
	slot := 0
	for _, lesson := range decode[api.Schedule](t, e.do("GET", "/me/schedule?from=2026-12-18&to=2026-12-18", &asS1, nil)).Lessons {
		if lesson.StartTime == "10:30" {
			slot++
			if lesson.Kind != api.LessonKindCredit {
				t.Fatalf("зачёт 18.12 не заменил пару: %+v", lesson)
			}
		}
	}
	if slot != 1 {
		t.Fatalf("18.12 в 10:30 занятий: %d", slot)
	}
	forms := map[string]api.ControlForm{}
	for _, discipline := range decode[api.CurrentGrades](t, e.do("GET", "/me/grades/current", &asS1, nil)).Disciplines {
		forms[discipline.Discipline.Name] = discipline.ControlForm
	}
	if forms["Международное публичное право"] != api.ControlFormCredit || forms["Английский язык"] != api.ControlFormCredit ||
		forms["Теория международных отношений"] != api.ControlFormExam {
		t.Fatalf("формы контроля не совпадают с сессией: %v", forms)
	}
}
