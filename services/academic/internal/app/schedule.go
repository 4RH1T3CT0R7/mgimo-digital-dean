package app

import (
	"context"
	"fmt"
	"sort"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/platform"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/academic/internal/api"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/academic/internal/calendar"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/academic/internal/db"
)

func (s *Server) GetMySchedule(ctx context.Context, req api.GetMyScheduleRequestObject) (api.GetMyScheduleResponseObject, error) {
	me, err := platform.RequireStudent(ctx)
	if err != nil {
		return nil, err
	}
	from, to, err := period(req.Params.From, req.Params.To, calendar.Monday(s.now()), calendar.Monday(s.now()).AddDate(0, 0, 6), 31)
	if err != nil {
		return nil, err
	}
	term, err := s.q.GetCurrentTerm(ctx)
	if err != nil {
		return nil, err
	}
	schedule, err := s.mySchedule(ctx, me.UserID, from, to, term)
	if err != nil {
		return nil, err
	}

	return api.GetMySchedule200JSONResponse(schedule), nil
}

func (s *Server) mySchedule(ctx context.Context, studentID uuid.UUID, from, to time.Time, term db.Term) (api.Schedule, error) {
	// Проверка существования не позволяет неизвестной личности получить чужие данные.
	if _, err := s.q.GetStudentMembership(ctx, studentID); err != nil {
		return api.Schedule{}, notFound(err)
	}
	rows, err := s.q.ListMyLessons(ctx, db.ListMyLessonsParams{StudentID: studentID, FromDate: pgDate(from), ToDate: pgDate(to)})
	if err != nil {
		return api.Schedule{}, err
	}
	result := api.Schedule{From: openapi_types.Date{Time: from}, To: openapi_types.Date{Time: to},
		Lessons: make([]api.Lesson, 0), Weeks: make([]api.WeekInfo, 0)}
	ids := make([]uuid.UUID, 0, len(rows))
	for _, row := range rows {
		ids = append(ids, row.Lesson.ID)
	}
	groups, err := s.lessonGroups(ctx, ids)
	if err != nil {
		return api.Schedule{}, err
	}
	for day := calendar.Monday(from); !day.After(to); day = day.AddDate(0, 0, 7) {
		number, parity := calendar.WeekOf(term.StartDate.Time, day)
		result.Weeks = append(result.Weeks, api.WeekInfo{StartDate: openapi_types.Date{Time: day}, Number: number, Parity: parity})
	}
	for _, row := range rows {
		lesson := lessonAPI(row.Lesson, row.DisciplineName, row.TeacherShort, groups[row.Lesson.ID])
		result.Lessons = append(result.Lessons, visibleSlots(lesson, from, to)...)
		if row.Lesson.UpdatedAt.After(result.AsOf) {
			result.AsOf = row.Lesson.UpdatedAt
		}
	}
	if result.AsOf.IsZero() {
		result.AsOf = s.now()
	}
	result.AsOf = result.AsOf.In(calendar.Moscow)
	sortLessons(result.Lessons)

	return result, nil
}

func (s *Server) ListStaffLessons(ctx context.Context, req api.ListStaffLessonsRequestObject) (api.ListStaffLessonsResponseObject, error) {
	me, err := platform.RequireStaffOrAdmin(ctx)
	if err != nil {
		return nil, err
	}
	scope := me.FacultyScope()
	if _, err := s.q.GetScopedGroup(ctx, db.GetScopedGroupParams{GroupID: req.Params.GroupId, FacultyID: scope}); err != nil {
		return nil, notFound(err)
	}
	monday := calendar.Monday(s.now())
	from, to, err := period(req.Params.From, req.Params.To, monday, monday.AddDate(0, 0, 6), 31)
	if err != nil {
		return nil, err
	}
	rows, err := s.q.ListStaffLessons(ctx, db.ListStaffLessonsParams{GroupID: req.Params.GroupId, FacultyID: scope,
		FromDate: pgDate(from), ToDate: pgDate(to)})
	if err != nil {
		return nil, err
	}
	result := make(api.ListStaffLessons200JSONResponse, 0)
	ids := make([]uuid.UUID, 0, len(rows))
	for _, row := range rows {
		ids = append(ids, row.Lesson.ID)
	}
	groups, err := s.lessonGroups(ctx, ids)
	if err != nil {
		return nil, err
	}
	for _, row := range rows {
		result = append(result, visibleSlots(lessonAPI(row.Lesson, row.DisciplineName, row.TeacherShort, groups[row.Lesson.ID]), from, to)...)
	}
	sortLessons(result)

	return result, nil
}

func period(fromParam, toParam *openapi_types.Date, defaultFrom, defaultTo time.Time, maxDays int) (time.Time, time.Time, error) {
	from, to := defaultFrom, defaultTo
	if fromParam != nil {
		from = calendar.Date(fromParam.Time)
	}
	if toParam != nil {
		to = calendar.Date(toParam.Time)
	}
	if from.After(to) {
		return from, to, platform.Validation(map[string]string{"to": "Конец периода должен быть не раньше начала"})
	}
	if maxDays > 0 && int(to.Sub(from).Hours()/24)+1 > maxDays {
		return from, to, platform.Validation(map[string]string{"to": "Период не должен превышать 31 день"})
	}

	return from, to, nil
}

func (s *Server) lessonGroups(ctx context.Context, ids []uuid.UUID) (map[uuid.UUID][]db.ListLessonGroupsRow, error) {
	result := make(map[uuid.UUID][]db.ListLessonGroupsRow, len(ids))
	if len(ids) == 0 {
		return result, nil
	}
	rows, err := s.q.ListLessonGroupsBatch(ctx, ids)
	if err != nil {
		return nil, err
	}
	for _, row := range rows {
		result[row.LessonID] = append(result[row.LessonID], db.ListLessonGroupsRow{ID: row.ID, Name: row.Name, FacultyID: row.FacultyID})
	}

	return result, nil
}

func lessonAPI(row db.Lesson, disciplineName string, teacherShort *string, groups []db.ListLessonGroupsRow) api.Lesson {
	lesson := api.Lesson{Id: row.ID, Date: apiDate(row.Date), StartTime: clockText(row.StartTime), EndTime: clockText(row.EndTime),
		PairNumber: int(row.PairNumber), Kind: api.LessonKind(row.Kind), Format: api.LessonFormat(row.Format),
		Status: api.LessonStatus(row.Status), Room: room(row.RoomBuilding, row.RoomNumber),
		Teacher: teacher(row.TeacherID, teacherShort), Groups: make([]api.GroupRef, 0, len(groups))}
	lesson.Discipline.Id, lesson.Discipline.Name = row.DisciplineID, disciplineName
	for _, group := range groups {
		lesson.Groups = append(lesson.Groups, api.GroupRef{Id: group.ID, Name: group.Name})
	}
	if row.ChangeType != nil && row.ChangedAt != nil {
		lesson.Change = &api.LessonChange{Type: api.LessonChangeType(*row.ChangeType), Reason: row.ChangeReason, ChangedAt: row.ChangedAt.In(calendar.Moscow)}
		lesson.Change.Previous.Date = apiDate(row.PrevDate)
		lesson.Change.Previous.StartTime, lesson.Change.Previous.EndTime = clockText(row.PrevStartTime), clockText(row.PrevEndTime)
		lesson.Change.Previous.Room = room(row.PrevRoomBuilding, row.PrevRoomNumber)
	}

	return lesson
}

func visibleSlots(lesson api.Lesson, from, to time.Time) []api.Lesson {
	slots := make([]api.Lesson, 0, 2)
	inRange := func(date openapi_types.Date) bool {
		day := calendar.Date(date.Time)

		return !day.Before(from) && !day.After(to)
	}
	if inRange(lesson.Date) {
		slots = append(slots, lesson)
	}
	if lesson.Status == api.LessonStatusMoved && lesson.Change != nil && inRange(lesson.Change.Previous.Date) {
		ghost := lesson
		ghost.Status = api.LessonStatusMovedAway
		ghost.Date = lesson.Change.Previous.Date
		ghost.StartTime, ghost.EndTime = lesson.Change.Previous.StartTime, lesson.Change.Previous.EndTime
		ghost.PairNumber = pairNumber(ghost.StartTime)
		ghost.Room = lesson.Change.Previous.Room
		ghost.MovedTo = newLike(ghost.MovedTo)
		ghost.MovedTo.Date, ghost.MovedTo.StartTime = lesson.Date, lesson.StartTime
		slots = append(slots, ghost)
	}

	return slots
}

func sortLessons(lessons []api.Lesson) {
	sort.SliceStable(lessons, func(i, j int) bool {
		a, b := lessons[i], lessons[j]
		if !a.Date.Time.Equal(b.Date.Time) {
			return a.Date.Time.Before(b.Date.Time)
		}
		if a.StartTime != b.StartTime {
			return a.StartTime < b.StartTime
		}

		return a.Id.String() < b.Id.String()
	})
}

func pgDate(t time.Time) pgtype.Date {
	return pgtype.Date{Time: calendar.Date(t), Valid: true}
}

func apiDate(t pgtype.Date) openapi_types.Date {
	return openapi_types.Date{Time: calendar.Date(t.Time)}
}

func clockText(t pgtype.Time) string {
	minutes := t.Microseconds / int64(time.Minute/time.Microsecond)

	return fmt.Sprintf("%02d:%02d", minutes/60, minutes%60)
}

func teacher(id *uuid.UUID, shortName *string) *api.TeacherRef {
	if id == nil || shortName == nil {
		return nil
	}

	return &api.TeacherRef{Id: *id, ShortName: *shortName}
}

func room(building, number *string) *api.Room {
	if building == nil || number == nil {
		return nil
	}

	return &api.Room{Building: *building, Number: *number}
}

func pairNumber(start string) int {
	for i, value := range []string{"09:00", "10:30", "12:00", "14:20", "15:50", "17:20", "18:50"} {
		if value == start {
			return i + 1
		}
	}

	return 8 // Свободное время вне стандартной сетки.
}
