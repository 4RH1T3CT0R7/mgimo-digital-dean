// Package rules содержит правила адресации и тексты событий.
package rules

import (
	"fmt"
	"slices"
	"strings"
	"time"

	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/clients/academic"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/events"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/notifications/internal/api"
	"github.com/google/uuid"
	"github.com/oapi-codegen/runtime/types"
)

type Audience = api.Audience
type Membership = academic.Membership

func Matches(a Audience, m Membership, userID uuid.UUID) bool {
	switch a.Kind {
	case api.All:
		return true
	case api.User:
		return a.UserId != nil && *a.UserId == userID
	case api.Faculty:
		return a.FacultyId != nil && *a.FacultyId == m.FacultyId
	case api.Course:
		return a.FacultyId != nil && *a.FacultyId == m.FacultyId && a.Course != nil && *a.Course == m.Course
	case api.Group:
		return a.GroupId != nil && slices.Contains(m.GroupIds, *a.GroupId)
	default:
		return false
	}
}

type Notification struct {
	Type        api.FeedItemType
	Title, Body string
	Important   bool
	Link        api.Link
	Audience    Audience
	AuthorLabel *string
}

func Render(event events.Event) (Notification, bool) {
	switch e := event.(type) {
	case events.LessonChanged:
		return lesson(e)
	case events.ApplicationStatusChanged:
		return applicationStatus(e)
	case events.ApplicationMessageAdded:
		if e.AuthorRole != "staff" {
			break
		}
		n := application(e.ApplicationID, e.StudentID)
		n.Type = api.FeedItemTypeApplicationMessage
		n.Title = "Ответ по заявке №" + e.Number
		n.Body = fmt.Sprintf("%s ответил по заявке «%s».", e.AuthorLabel, e.ServiceTitle)
		n.AuthorLabel = &e.AuthorLabel
		return n, true
	}
	return Notification{}, false
}

func lesson(e events.LessonChanged) (Notification, bool) {
	current, err := time.Parse(time.DateOnly, e.Current.Date)
	if err != nil {
		return Notification{}, false
	}
	n := Notification{
		Type:     api.FeedItemTypeScheduleChange,
		Link:     api.Link{Kind: api.LinkKindLesson, Id: &e.LessonID, Date: &types.Date{Time: current}},
		Audience: Audience{Kind: api.Group, FacultyId: &e.FacultyID},
	}
	oldSlot := func() string {
		previous, _ := time.Parse(time.DateOnly, e.Previous.Date)
		return previous.Format("02.01") + " в " + e.Previous.StartTime
	}
	newSlot := current.Format("02.01") + " в " + e.Current.StartTime
	room := ""
	if e.Current.Room != nil && strings.TrimSpace(*e.Current.Room) != "" {
		room = ", " + strings.TrimSpace(*e.Current.Room)
	}
	switch e.ChangeType {
	case "moved", "cancelled":
		if _, err := time.Parse(time.DateOnly, e.Previous.Date); err != nil {
			return Notification{}, false
		}
		n.Important = true
		if e.ChangeType == "moved" {
			n.Title = "Перенос: " + e.DisciplineName
			n.Body = "Занятие " + oldSlot() + " перенесено на " + newSlot + room + "."
		} else {
			n.Title = "Отмена: " + e.DisciplineName
			n.Body = "Занятие " + oldSlot() + " отменено."
		}
		if e.Reason != nil && strings.TrimSpace(*e.Reason) != "" {
			n.Body += " " + strings.TrimSpace(*e.Reason)
		}
	case "room_changed":
		n.Title = "Другая аудитория: " + e.DisciplineName
		n.Body = "Занятие " + newSlot + " пройдёт в " + strings.TrimPrefix(room, ", ") + "."
		if room == "" {
			n.Body = "Занятие " + newSlot + ": аудитория изменилась."
		}
	default:
		return Notification{}, false
	}
	return n, true
}

func application(id, student uuid.UUID) Notification {
	return Notification{
		Type:     api.FeedItemTypeApplicationStatus,
		Link:     api.Link{Kind: api.LinkKindApplication, Id: &id},
		Audience: Audience{Kind: api.User, UserId: &student},
	}
}

func applicationStatus(e events.ApplicationStatusChanged) (Notification, bool) {
	n := application(e.ApplicationID, e.StudentID)
	number := "заявка №" + e.Number
	comment := func(fallback string) string {
		if e.Comment != nil && strings.TrimSpace(*e.Comment) != "" {
			return e.ServiceTitle + ": " + strings.TrimSpace(*e.Comment)
		}
		return e.ServiceTitle + ": " + fallback
	}
	switch e.NewStatus {
	case "in_progress":
		n.Title = "Заявка №" + e.Number + " в работе"
		n.Body = e.ServiceTitle + ": деканат начал обработку."
	case "needs_info":
		n.Title = "Нужны уточнения по заявке №" + e.Number
		n.Body = comment("посмотрите, что нужно уточнить, в карточке заявки.")
		n.Important = true
	case "ready":
		n.Title = "Готово: " + number
		n.Body = e.ServiceTitle + ": можно скачать или забрать в деканате."
		if e.ServiceTypeID == "study-certificate" {
			n.Body = "Справка готова, её можно скачать."
		}
		n.Important = true
	case "rejected":
		n.Title = "Заявка №" + e.Number + " отклонена"
		n.Body = comment("подробности в карточке заявки.")
		n.Important = true
	default:
		// submitted и cancelled — действия самого студента, уведомление не нужно.
		return Notification{}, false
	}
	return n, true
}
