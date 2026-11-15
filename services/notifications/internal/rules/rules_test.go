package rules

import (
	"testing"

	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/events"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/notifications/internal/api"
	"github.com/google/uuid"
)

func TestR1Matches(t *testing.T) {
	f1, f2, g1, g2, g3, g9, u1, u2 := uuid.New(), uuid.New(), uuid.New(), uuid.New(), uuid.New(), uuid.New(), uuid.New(), uuid.New()
	c2, c3 := 2, 3
	m := Membership{StudentId: u1, FacultyId: f1, Course: c2, GroupIds: []uuid.UUID{g1, g2, g3}}
	for _, tc := range []struct {
		name     string
		audience Audience
		want     bool
	}{
		{"all", Audience{Kind: api.All}, true},
		{"user U1", Audience{Kind: api.User, UserId: &u1}, true},
		{"user U2", Audience{Kind: api.User, UserId: &u2}, false},
		{"faculty F1", Audience{Kind: api.Faculty, FacultyId: &f1}, true},
		{"faculty F2", Audience{Kind: api.Faculty, FacultyId: &f2}, false},
		{"course F1 2", Audience{Kind: api.Course, FacultyId: &f1, Course: &c2}, true},
		{"course F1 3", Audience{Kind: api.Course, FacultyId: &f1, Course: &c3}, false},
		{"course F2 2", Audience{Kind: api.Course, FacultyId: &f2, Course: &c2}, false},
		{"group G2", Audience{Kind: api.Group, GroupId: &g2}, true},
		{"group G9", Audience{Kind: api.Group, GroupId: &g9}, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := Matches(tc.audience, m, u1); got != tc.want {
				t.Fatalf("Matches = %v, нужно %v", got, tc.want)
			}
		})
	}
}

func TestR2Render(t *testing.T) {
	applicationID, student, lessonID := uuid.New(), uuid.New(), uuid.New()
	room, reason, repair := "Главный корпус, 3047", "Преподаватель заболел", "В аудитории ремонт!"
	prev := events.LessonSlot{Date: "2026-11-17", StartTime: "10:30"}
	cur := events.LessonSlot{Date: "2026-11-19", StartTime: "12:00", Room: &room}
	lesson := func(kind string, slot events.LessonSlot, reason *string) events.LessonChanged {
		return events.LessonChanged{LessonID: lessonID, DisciplineName: "История дипломатии", ChangeType: kind, Previous: prev, Current: slot, Reason: reason}
	}
	status := func(kind, id, title string, comment *string) events.ApplicationStatusChanged {
		return events.ApplicationStatusChanged{ApplicationID: applicationID, StudentID: student, NewStatus: kind, ServiceTypeID: id, ServiceTitle: title, Number: "000123", Comment: comment}
	}
	message := func(role string) events.ApplicationMessageAdded {
		return events.ApplicationMessageAdded{ApplicationID: applicationID, StudentID: student, AuthorRole: role, AuthorLabel: "Деканат ФМО", ServiceTitle: "Справка в военкомат", Number: "000123"}
	}
	info, reject := "Приложите справку о составе семьи", "Неполный пакет документов"
	for _, tc := range []struct {
		name        string
		event       events.Event
		title, body string
		important   bool
		link        api.LinkKind
		date        string
	}{
		{"move", lesson("moved", cur, &reason), "Перенос: История дипломатии", "Занятие 17.11 в 10:30 перенесено на 19.11 в 12:00, Главный корпус, 3047. Преподаватель заболел.", true, api.LinkKindLesson, "2026-11-19"},
		{"cancel lesson", lesson("cancelled", prev, nil), "Отмена: История дипломатии", "Занятие 17.11 в 10:30 отменено.", true, api.LinkKindLesson, "2026-11-17"},
		{"cancel with reason", lesson("cancelled", prev, &repair), "Отмена: История дипломатии", "Занятие 17.11 в 10:30 отменено. В аудитории ремонт!", true, api.LinkKindLesson, "2026-11-17"},
		{"room", lesson("room_changed", cur, nil), "Другая аудитория: История дипломатии", "Занятие 19.11 в 12:00 пройдёт в Главный корпус, 3047.", false, api.LinkKindLesson, "2026-11-19"},
		{"submitted", status("submitted", "", "", nil), "", "", false, "", ""},
		{"cancelled", status("cancelled", "financial-aid", "Материальная помощь", nil), "", "", false, "", ""},
		{"progress", status("in_progress", "military-certificate", "Справка в военкомат", nil), "Заявка №000123 в работе", "Справка в военкомат: деканат взял заявку в работу.", false, api.LinkKindApplication, ""},
		{"info", status("needs_info", "financial-aid", "Материальная помощь", &info), "Нужны уточнения по заявке №000123", "Материальная помощь: Приложите справку о составе семьи", true, api.LinkKindApplication, ""},
		{"transcript", status("ready", "transcript", "Выписка оценок / транскрипт", nil), "Готово: заявка №000123", "Выписка оценок / транскрипт: можно скачать или забрать в деканате.", true, api.LinkKindApplication, ""},
		{"certificate", status("ready", "study-certificate", "Справка с места учёбы", nil), "Готово: заявка №000123", "Справка готова, её можно скачать.", true, api.LinkKindApplication, ""},
		{"rejected", status("rejected", "financial-aid", "Материальная помощь", &reject), "Заявка №000123 отклонена", "Материальная помощь: Неполный пакет документов", true, api.LinkKindApplication, ""},
		{"staff message", message("staff"), "Ответ по заявке №000123", "Деканат ФМО ответил по заявке «Справка в военкомат».", false, api.LinkKindApplication, ""},
		{"student message", message("student"), "", "", false, "", ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got, ok := Render(tc.event)
			if ok != (tc.title != "") || got.Title != tc.title || got.Body != tc.body || got.Important != tc.important || got.Link.Kind != tc.link {
				t.Fatalf("Render = %+v, ok=%v", got, ok)
			}
			var want api.FeedItemType
			switch tc.event.(type) {
			case events.LessonChanged:
				want = api.FeedItemTypeScheduleChange
			case events.ApplicationStatusChanged:
				want = api.FeedItemTypeApplicationStatus
			case events.ApplicationMessageAdded:
				want = api.FeedItemTypeApplicationMessage
			}
			if ok && got.Type != want {
				t.Fatalf("тип %q, нужен %q", got.Type, want)
			}
			if tc.link == api.LinkKindLesson && (got.Link.Date == nil || got.Link.Date.String() != tc.date || got.Link.Id == nil || *got.Link.Id != lessonID) {
				t.Fatalf("ссылка: %+v", got.Link)
			}
			if tc.link == api.LinkKindApplication && (got.Link.Date != nil || got.Link.Id == nil || *got.Link.Id != applicationID || got.Audience.UserId == nil || *got.Audience.UserId != student) {
				t.Fatalf("ссылка или адресат: %+v", got)
			}
		})
	}
}
