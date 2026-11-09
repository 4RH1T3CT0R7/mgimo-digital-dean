package app

import (
	"context"
	"errors"
	"math"
	"sort"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/platform"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/academic/internal/api"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/academic/internal/calendar"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/academic/internal/db"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/academic/internal/grading"
)

func (s *Server) myGrades(ctx context.Context) (platform.Identity, int, []db.ListMyDisciplinesRow, time.Time, error) {
	me, err := platform.RequireStudent(ctx)
	if err != nil {
		return me, 0, nil, time.Time{}, err
	}
	student, err := s.q.GetStudentMembership(ctx, me.UserID)
	if err != nil {
		return me, 0, nil, time.Time{}, notFound(err)
	}
	term, err := s.q.GetCurrentTerm(ctx)
	if err != nil {
		return me, 0, nil, time.Time{}, err
	}
	rows, err := s.q.ListMyDisciplines(ctx, me.UserID)
	if err != nil {
		return me, 0, nil, time.Time{}, err
	}
	asOf := time.Time{}
	for _, row := range rows {
		if row.StudentDiscipline.UpdatedAt.After(asOf) {
			asOf = row.StudentDiscipline.UpdatedAt
		}
	}
	if asOf.IsZero() {
		asOf = s.now()
	}
	semester := calendar.SemesterNumber(int(student.Course), api.SessionResultsSemestersTerm(term.Term))

	return me, semester, rows, asOf.In(calendar.Moscow), nil
}

func (s *Server) GetMyCurrentGrades(ctx context.Context, _ api.GetMyCurrentGradesRequestObject) (api.GetMyCurrentGradesResponseObject, error) {
	me, semester, rows, asOf, err := s.myGrades(ctx)
	if err != nil {
		return nil, err
	}
	points, err := s.q.ListMyControlPoints(ctx, db.ListMyControlPointsParams{StudentID: me.UserID, Semester: int32(semester)})
	if err != nil {
		return nil, err
	}

	result := api.CurrentGrades{AsOf: asOf, Semester: semester, Disciplines: make([]api.CurrentDiscipline, 0)}
	for _, row := range rows {
		sd := row.StudentDiscipline
		if int(sd.Semester) != semester {
			continue
		}
		discipline := api.CurrentDiscipline{ControlForm: api.ControlForm(sd.ControlForm),
			Score: value(sd.CurrentScore), MaxToDate: value(sd.MaxToDate), AttendancePercent: value(sd.AttendancePercent)}
		discipline.Discipline.Id, discipline.Discipline.Name = sd.DisciplineID, row.DisciplineName
		discipline.Teacher = teacher(sd.TeacherID, row.TeacherShort)
		traffic, reason, needed, achievable := grading.Traffic(discipline.Score, discipline.MaxToDate, discipline.AttendancePercent)
		discipline.Traffic = traffic
		if reason != "" {
			discipline.TrafficReason = &reason
		}
		discipline.ToExcellent.Needed, discipline.ToExcellent.Achievable = needed, achievable
		discipline.ControlPoints = emptySlice(discipline.ControlPoints)
		for _, point := range points {
			if point.DisciplineID != sd.DisciplineID {
				continue
			}
			discipline.ControlPoints = appendZero(discipline.ControlPoints)
			target := &discipline.ControlPoints[len(discipline.ControlPoints)-1]
			target.Date, target.Title = apiDate(point.Date), point.Title
			target.Score, target.Max = intPointer(point.Score), int(point.Max)
		}
		result.Disciplines = append(result.Disciplines, discipline)
	}
	priority := map[api.Traffic]int{api.Red: 0, api.Yellow: 1, api.Green: 2}
	sort.SliceStable(result.Disciplines, func(i, j int) bool {
		return priority[result.Disciplines[i].Traffic] < priority[result.Disciplines[j].Traffic]
	})

	return api.GetMyCurrentGrades200JSONResponse(result), nil
}

func (s *Server) GetMyGradesSummary(ctx context.Context, _ api.GetMyGradesSummaryRequestObject) (api.GetMyGradesSummaryResponseObject, error) {
	me, semester, rows, asOf, err := s.myGrades(ctx)
	if err != nil {
		return nil, err
	}
	summary := api.GradesSummary{AsOf: asOf, CurrentSemester: semester}
	grades := make([]grading.Grade5, 0)
	total := 0
	for _, row := range rows {
		sd := row.StudentDiscipline
		percent := intPointer(sd.Percent)
		form := api.ControlForm(sd.ControlForm)
		if int(sd.Semester) < semester && grading.ResultStatus(form, percent, sd.Passed) == api.Failed {
			summary.DebtsCount++
		}
		if form != api.ControlFormCredit && percent != nil {
			grade, _ := grading.Grade(*percent)
			grades = append(grades, grade)
			total += *percent
		}
		if int(sd.Semester) == semester {
			traffic, _, _, _ := grading.Traffic(value(sd.CurrentScore), value(sd.MaxToDate), value(sd.AttendancePercent))
			switch traffic {
			case api.Red:
				summary.Traffic.Red++
			case api.Yellow:
				summary.Traffic.Yellow++
			case api.Green:
				summary.Traffic.Green++
			}
		}
	}
	if average := grading.AverageGrade5(grades); average != nil {
		grade5 := float32(*average)
		percent := float32(math.Round(float64(total)/float64(len(grades))*100) / 100)
		summary.AverageGrade5, summary.AveragePercent = &grade5, &percent
	}
	rating, err := s.q.GetMyRating(ctx, db.GetMyRatingParams{StudentID: me.UserID, CurrentSemester: int32(semester)})
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}
	if err == nil {
		summary.Rating = newLike(summary.Rating)
		summary.Rating.Semester = int(rating.Semester)
		summary.Rating.Percent = float32(rating.Percent)
		summary.Rating.Percentile = intPointer(rating.Percentile)
	}

	return api.GetMyGradesSummary200JSONResponse(summary), nil
}

func (s *Server) GetMySessionResults(ctx context.Context, _ api.GetMySessionResultsRequestObject) (api.GetMySessionResultsResponseObject, error) {
	_, current, rows, asOf, err := s.myGrades(ctx)
	if err != nil {
		return nil, err
	}
	result := api.SessionResults{AsOf: asOf}
	result.Semesters = emptySlice(result.Semesters)
	for _, row := range rows {
		sd := row.StudentDiscipline
		if int(sd.Semester) >= current {
			continue
		}
		if len(result.Semesters) == 0 || result.Semesters[len(result.Semesters)-1].Semester != int(sd.Semester) {
			result.Semesters = appendZero(result.Semesters)
			semester := &result.Semesters[len(result.Semesters)-1]
			semester.Semester, semester.AcademicYear = int(sd.Semester), sd.AcademicYear
			semester.Term, semester.Results = api.SessionResultsSemestersTerm(sd.Term), make([]api.SessionResult, 0)
		}
		item := api.SessionResult{ControlForm: api.ControlForm(sd.ControlForm), Hours: int(sd.Hours), Credits: int(sd.Credits)}
		item.Discipline.Id, item.Discipline.Name = sd.DisciplineID, row.DisciplineName
		if sd.ResultDate.Valid {
			date := apiDate(sd.ResultDate)
			item.Date = &date
		}
		if item.ControlForm == api.ControlFormCredit {
			item.Passed = sd.Passed
		} else {
			item.Percent = intPointer(sd.Percent)
			if item.Percent != nil {
				grade, ects := grading.Grade(*item.Percent)
				item.Grade5, item.Ects = &grade, &ects
			}
		}
		item.Status = grading.ResultStatus(item.ControlForm, item.Percent, item.Passed)
		last := &result.Semesters[len(result.Semesters)-1]
		last.Results = append(last.Results, item)
	}

	return api.GetMySessionResults200JSONResponse(result), nil
}

func value(v *int32) int {
	if v == nil {
		return 0
	}

	return int(*v)
}
