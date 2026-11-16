package app

import (
	"context"
	"sort"

	"github.com/google/uuid"

	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/platform"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/academic/internal/api"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/academic/internal/calendar"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/academic/internal/db"
)

// Занятия сессии, которые попадают в календарный план (D62).
var sessionKinds = map[string]api.AcademicEventKind{
	"consultation": api.AcademicEventKindConsultation,
	"credit":       api.AcademicEventKindCredit,
	"exam":         api.AcademicEventKindExam,
}

func (s *Server) GetMyAcademicCalendar(ctx context.Context, _ api.GetMyAcademicCalendarRequestObject) (api.GetMyAcademicCalendarResponseObject, error) {
	me, err := platform.RequireStudent(ctx)
	if err != nil {
		return nil, err
	}
	term, err := s.q.GetCurrentTerm(ctx)
	if err != nil {
		return nil, err
	}
	points, err := s.myControlPoints(ctx, me.UserID, term)
	if err != nil {
		return nil, err
	}
	periods, err := s.q.ListTermPeriods(ctx, term.ID)
	if err != nil {
		return nil, err
	}
	lessons, err := s.q.ListMyLessons(ctx, db.ListMyLessonsParams{StudentID: me.UserID, FromDate: term.StartDate, ToDate: term.EndDate})
	if err != nil {
		return nil, err
	}

	result := api.AcademicCalendar{Periods: make([]api.TermPeriod, 0, len(periods)), Events: make([]api.AcademicEvent, 0, len(points))}
	result.Term.AcademicYear, result.Term.Term = term.AcademicYear, api.AcademicCalendarTermTerm(term.Term)
	result.Term.StartDate, result.Term.EndDate = apiDate(term.StartDate), apiDate(term.EndDate)
	for _, period := range periods {
		result.Periods = append(result.Periods, api.TermPeriod{Kind: api.TermPeriodKind(period.Kind),
			StartDate: apiDate(period.StartDate), EndDate: apiDate(period.EndDate)})
	}
	for _, point := range points {
		event := api.AcademicEvent{Id: point.ID, Kind: api.AcademicEventKindControlPoint, Date: apiDate(point.Date), Title: &point.Title}
		event.Discipline.Id, event.Discipline.Name = point.DisciplineID, point.DisciplineName
		result.Events = append(result.Events, event)
	}
	for _, row := range lessons {
		lesson := row.Lesson
		kind, ok := sessionKinds[lesson.Kind]
		// ListMyLessons отдаёт и перенесённые за пределы семестра (по старой дате) — их не показываем.
		if !ok || lesson.Status == "cancelled" || lesson.Date.Time.Before(term.StartDate.Time) || lesson.Date.Time.After(term.EndDate.Time) {
			continue
		}
		start, end := clockText(lesson.StartTime), clockText(lesson.EndTime)
		event := api.AcademicEvent{Id: lesson.ID, Kind: kind, Date: apiDate(lesson.Date), StartTime: &start, EndTime: &end,
			Room: room(lesson.RoomBuilding, lesson.RoomNumber)}
		event.Discipline.Id, event.Discipline.Name = lesson.DisciplineID, row.DisciplineName
		result.Events = append(result.Events, event)
	}
	// Контрольная точка без времени идёт раньше занятий того же дня.
	sort.SliceStable(result.Events, func(i, j int) bool {
		a, b := result.Events[i], result.Events[j]
		if !a.Date.Time.Equal(b.Date.Time) {
			return a.Date.Time.Before(b.Date.Time)
		}

		return a.StartTime != nil && b.StartTime != nil && *a.StartTime < *b.StartTime || a.StartTime == nil && b.StartTime != nil
	})

	return api.GetMyAcademicCalendar200JSONResponse(result), nil
}

// Контрольные точки текущего семестра студента; неизвестный студент — 404.
func (s *Server) myControlPoints(ctx context.Context, studentID uuid.UUID, term db.Term) ([]db.ListMyControlPointsRow, error) {
	student, err := s.q.GetStudentMembership(ctx, studentID)
	if err != nil {
		return nil, notFound(err)
	}
	semester := calendar.SemesterNumber(int(student.Course), calendar.Term(term.Term))

	return s.q.ListMyControlPoints(ctx, db.ListMyControlPointsParams{StudentID: studentID, Semester: int32(semester)})
}
