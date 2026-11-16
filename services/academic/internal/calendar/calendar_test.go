package calendar_test

import (
	"testing"
	"time"

	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/academic/internal/api"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/academic/internal/calendar"
)

func TestC1SemesterNumber(t *testing.T) {
	for _, tc := range []struct {
		course int
		term   calendar.Term
		want   int
	}{{1, api.SessionResultsSemestersTermAutumn, 1}, {1, api.SessionResultsSemestersTermSpring, 2}, {2, api.SessionResultsSemestersTermAutumn, 3}, {3, api.SessionResultsSemestersTermAutumn, 5}} {
		if got := calendar.SemesterNumber(tc.course, tc.term); got != tc.want {
			t.Errorf("SemesterNumber(%d,%s) = %d; ожидалось %d", tc.course, tc.term, got, tc.want)
		}
	}
}

func TestC2WeekOf(t *testing.T) {
	start := time.Date(2026, 9, 1, 0, 0, 0, 0, calendar.Moscow)
	for _, tc := range []struct {
		date   string
		week   int
		parity calendar.Parity
	}{
		{"2026-08-31", 1, api.Odd}, {"2026-09-06", 1, api.Odd},
		{"2026-09-07", 2, api.Even}, {"2026-11-16", 12, api.Even},
		{"2026-11-22", 12, api.Even}, {"2026-11-23", 13, api.Odd},
	} {
		date, err := time.ParseInLocation(time.DateOnly, tc.date, calendar.Moscow)
		if err != nil {
			t.Fatal(err)
		}
		week, parity := calendar.WeekOf(start, date)
		if week != tc.week || parity != tc.parity {
			t.Errorf("WeekOf(%s) = %d,%s; ожидалось %d,%s", tc.date, week, parity, tc.week, tc.parity)
		}
	}
}
