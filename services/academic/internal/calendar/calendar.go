// Package calendar — календарные расчёты по Б3, даты в часовом поясе Москвы.
package calendar

import (
	"time"

	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/academic/internal/api"
)

type Term = api.SessionResultsSemestersTerm
type Parity = api.WeekInfoParity

var Moscow = time.FixedZone("Europe/Moscow", 3*60*60)

func Date(t time.Time) time.Time {
	t = t.In(Moscow)

	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, Moscow)
}

func Monday(t time.Time) time.Time {
	t = Date(t)
	days := (int(t.Weekday()) + 6) % 7

	return t.AddDate(0, 0, -days)
}

func SemesterNumber(course int, term Term) int {
	number := (course-1)*2 + 1
	if term == api.Spring {
		number++
	}

	return number
}

func WeekOf(termStart, date time.Time) (int, Parity) {
	number := max(1, int(Monday(date).Sub(Monday(termStart)).Hours()/24/7)+1)
	if number%2 == 0 {
		return number, api.Even
	}

	return number, api.Odd
}
