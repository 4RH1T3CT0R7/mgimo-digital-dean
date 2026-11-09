// Package grading — чистые расчёты по Б1 и Б2 модели данных.
package grading

import (
	"math"

	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/academic/internal/api"
)

type Grade5 = api.Grade5
type Ects = api.Ects
type Status = api.SessionResultStatus

func Grade(percent int) (Grade5, Ects) {
	switch {
	case percent >= 90:
		return api.Excellent, api.A
	case percent >= 82:
		return api.Good, api.B
	case percent >= 75:
		return api.Good, api.C
	case percent >= 67:
		return api.Satisfactory, api.D
	case percent >= 60:
		return api.Satisfactory, api.E
	default:
		return api.Unsatisfactory, api.F
	}
}

func ResultStatus(form api.ControlForm, percent *int, passed *bool) Status {
	if form == api.ControlFormCredit {
		if passed == nil {
			return api.Pending
		}
		if !*passed {
			return api.Failed
		}

		return api.Passed
	}
	if percent == nil {
		return api.Pending
	}
	if *percent < 60 {
		return api.Failed
	}

	return api.Passed
}

func AverageGrade5(grades []Grade5) *float64 {
	if len(grades) == 0 {
		return nil
	}

	values := map[Grade5]int{api.Excellent: 5, api.Good: 4, api.Satisfactory: 3, api.Unsatisfactory: 2}
	total := 0
	for _, grade := range grades {
		total += values[grade]
	}
	average := math.Round(float64(total)/float64(len(grades))*100) / 100

	return &average
}

func Traffic(score, maxToDate, attendance int) (api.Traffic, string, int, bool) {
	needed := max(0, 90-score)
	achievable := needed <= 100-maxToDate

	switch {
	case maxToDate == 0:
		return api.Green, "Оценок пока нет", needed, achievable
	case score*100 < maxToDate*60:
		return api.Red, "Набрано меньше 60% возможных баллов", needed, achievable
	case attendance < 50:
		return api.Red, "Посещаемость ниже 50%", needed, achievable
	case score*100 < maxToDate*75:
		return api.Yellow, "Набрано меньше 75% возможных баллов", needed, achievable
	case attendance < 70:
		return api.Yellow, "Посещаемость ниже 70%", needed, achievable
	default:
		return api.Green, "", needed, achievable
	}
}
