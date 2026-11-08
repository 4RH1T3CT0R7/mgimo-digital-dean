package app

import (
	"reflect"
	"testing"
	"time"

	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/academic/internal/api"
	openapi_types "github.com/oapi-codegen/runtime/types"
)

func TestCancelledEventUsesActualSlot(t *testing.T) {
	lesson := api.Lesson{Status: api.LessonStatusCancelled, StartTime: "12:00", EndTime: "13:20"}
	lesson.Date = openapi_types.Date{Time: time.Date(2026, 11, 19, 0, 0, 0, 0, time.UTC)}
	lesson.Change = &api.LessonChange{Type: api.LessonChangeTypeCancelled}
	// prev_* намеренно сохраняет самый первый слот по UpdateLesson.
	lesson.Change.Previous.Date = openapi_types.Date{Time: time.Date(2026, 11, 17, 0, 0, 0, 0, time.UTC)}
	lesson.Change.Previous.StartTime, lesson.Change.Previous.EndTime = "10:30", "11:50"
	lesson.Room = &api.Room{Building: "Главный корпус", Number: "3047"}
	lesson.Change.Previous.Room = &api.Room{Building: "Главный корпус", Number: "2105"}

	event := lessonEvent(lesson, nil)
	if event.Current.Date != "2026-11-19" || event.Current.StartTime != "12:00" || event.Current.EndTime != "13:20" ||
		!reflect.DeepEqual(event.Previous, event.Current) || event.Current.Room == nil || *event.Current.Room != "Главный корпус, 3047" {
		t.Fatalf("отменённый слот: previous=%+v current=%+v", event.Previous, event.Current)
	}
	if lesson.Change.Previous.Date.String() != "2026-11-17" {
		t.Fatal("исходный слот ответа API изменён")
	}
}
