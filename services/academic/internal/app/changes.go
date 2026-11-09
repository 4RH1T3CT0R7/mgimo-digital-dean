package app

import (
	"context"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/events"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/platform"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/academic/internal/api"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/academic/internal/db"
)

func (s *Server) ChangeLesson(ctx context.Context, req api.ChangeLessonRequestObject) (api.ChangeLessonResponseObject, error) {
	me, err := platform.RequireStaffOrAdmin(ctx)
	if err != nil {
		return nil, err
	}
	if req.Body == nil {
		return nil, platform.Validation(map[string]string{"type": "Укажите тип изменения"})
	}
	if err := validateChange(*req.Body); err != nil {
		return nil, err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	q := s.q.WithTx(tx)
	row, err := q.LockScopedLesson(ctx, db.LockScopedLessonParams{LessonID: req.LessonId, FacultyID: me.FacultyScope()})
	if err != nil {
		return nil, notFound(err)
	}
	if row.Lesson.Status == string(api.LessonStatusCancelled) {
		return nil, platform.Conflict("conflict", "Занятие уже отменено, изменить его нельзя")
	}
	groups, err := q.ListLessonGroups(ctx, req.LessonId)
	if err != nil {
		return nil, err
	}

	old := row.Lesson
	now := s.now()
	changeType := string(req.Body.Type)
	params := db.UpdateLessonParams{LessonID: req.LessonId, FacultyID: me.FacultyScope(), Date: old.Date,
		StartTime: old.StartTime, EndTime: old.EndTime, PairNumber: old.PairNumber,
		RoomBuilding: old.RoomBuilding, RoomNumber: old.RoomNumber, Status: old.Status,
		ChangeType: &changeType, ChangeReason: req.Body.Reason, ChangedAt: &now}
	switch req.Body.Type {
	case api.LessonChangeTypeMoved:
		params.Date = pgDate(req.Body.NewDate.Time)
		params.StartTime, _ = parseClock(*req.Body.NewStartTime)
		params.EndTime, _ = parseClock(*req.Body.NewEndTime)
		params.PairNumber = int32(pairNumber(*req.Body.NewStartTime))
		params.Status = string(api.LessonStatusMoved)
	case api.LessonChangeTypeCancelled:
		params.Status = string(api.LessonStatusCancelled)
	case api.LessonChangeTypeRoomChanged:
		if params.Status != string(api.LessonStatusMoved) {
			params.Status = string(api.LessonStatusChanged)
		}
	}
	if req.Body.Type != api.LessonChangeTypeCancelled && req.Body.NewRoom != nil {
		building, number := strings.TrimSpace(req.Body.NewRoom.Building), strings.TrimSpace(req.Body.NewRoom.Number)
		params.RoomBuilding, params.RoomNumber = &building, &number
	}
	changed, err := q.UpdateLesson(ctx, params)
	if err != nil {
		return nil, notFound(err)
	}
	lesson := lessonAPI(changed, row.DisciplineName, row.TeacherShort, groups)
	event := lessonEvent(lesson, groups)
	// Событие описывает конкретное изменение; prev_* ответа хранит первый слот.
	event.Previous = events.LessonSlot{Date: apiDate(old.Date).String(), StartTime: clockText(old.StartTime),
		EndTime: clockText(old.EndTime), Room: eventRoom(room(old.RoomBuilding, old.RoomNumber))}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	// Уведомление вторично: сбой NATS не отменяет уже сохранённое изменение.
	if s.bus != nil {
		publishCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
		defer cancel()
		if err := events.Publish(publishCtx, s.bus, event); err != nil {
			platform.Log(ctx).Error("event_publish_failed", "lesson_id", req.LessonId, "event_type", event.Subject(), "error", err.Error())
		}
	}

	return api.ChangeLesson200JSONResponse(lesson), nil
}

func validateChange(change api.LessonChangeRequest) error {
	fields := make(map[string]string)
	switch change.Type {
	case api.LessonChangeTypeMoved:
		if change.NewDate == nil {
			fields["new_date"] = "Укажите новую дату"
		}
		if change.NewStartTime == nil {
			fields["new_start_time"] = "Укажите время начала"
		} else if _, err := parseClock(*change.NewStartTime); err != nil {
			fields["new_start_time"] = "Укажите время в формате ЧЧ:ММ"
		}
		if change.NewEndTime == nil {
			fields["new_end_time"] = "Укажите время окончания"
		} else if _, err := parseClock(*change.NewEndTime); err != nil {
			fields["new_end_time"] = "Укажите время в формате ЧЧ:ММ"
		}
		if change.NewStartTime != nil && change.NewEndTime != nil && *change.NewStartTime >= *change.NewEndTime {
			fields["new_end_time"] = "Окончание должно быть позже начала"
		}
	case api.LessonChangeTypeRoomChanged:
		if change.NewRoom == nil {
			fields["new_room"] = "Укажите новую аудиторию"
		}
	case api.LessonChangeTypeCancelled:
	default:
		fields["type"] = "Выберите допустимый тип изменения"
	}
	if change.NewRoom != nil && (strings.TrimSpace(change.NewRoom.Building) == "" || strings.TrimSpace(change.NewRoom.Number) == "") {
		fields["new_room"] = "Укажите корпус и номер аудитории"
	}
	if change.NewRoom != nil {
		if utf8.RuneCountInString(change.NewRoom.Building) > 100 {
			fields["new_room.building"] = "Корпус должен быть не длиннее 100 символов"
		}
		if utf8.RuneCountInString(change.NewRoom.Number) > 100 {
			fields["new_room.number"] = "Аудитория должна быть не длиннее 100 символов"
		}
	}
	if change.Reason != nil && utf8.RuneCountInString(*change.Reason) > 300 {
		fields["reason"] = "Причина должна быть не длиннее 300 символов"
	}
	if len(fields) != 0 {
		return platform.Validation(fields)
	}

	return nil
}

func parseClock(value string) (pgtype.Time, error) {
	parsed, err := time.Parse("15:04", value)
	if err != nil || len(value) != 5 {
		return pgtype.Time{}, platform.Validation(nil)
	}

	return pgtype.Time{Microseconds: int64(parsed.Hour()*60+parsed.Minute()) * int64(time.Minute/time.Microsecond), Valid: true}, nil
}

func lessonEvent(lesson api.Lesson, groups []db.ListLessonGroupsRow) events.LessonChanged {
	event := events.LessonChanged{LessonID: lesson.Id, DisciplineName: lesson.Discipline.Name,
		GroupIDs: make([]uuid.UUID, 0, len(groups))}
	if len(groups) > 0 {
		event.FacultyID = groups[0].FacultyID
	}
	for _, group := range groups {
		event.GroupIDs = append(event.GroupIDs, group.ID)
	}
	if lesson.Change != nil {
		event.ChangeType, event.Reason = string(lesson.Change.Type), lesson.Change.Reason
		previous := lesson.Change.Previous
		event.Previous = events.LessonSlot{Date: previous.Date.String(), StartTime: previous.StartTime, EndTime: previous.EndTime, Room: eventRoom(previous.Room)}
	}
	event.Current = events.LessonSlot{Date: lesson.Date.String(), StartTime: lesson.StartTime, EndTime: lesson.EndTime, Room: eventRoom(lesson.Room)}
	if lesson.Status == api.LessonStatusCancelled {
		// API хранит самый первый слот для расписания; отменяется фактический слот.
		event.Previous = event.Current
	}

	return event
}

func eventRoom(room *api.Room) *string {
	if room == nil {
		return nil
	}
	value := room.Building + ", " + room.Number

	return &value
}
