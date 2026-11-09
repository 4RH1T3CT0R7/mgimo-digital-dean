package grading_test

import (
	"testing"

	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/academic/internal/api"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/academic/internal/grading"
)

func TestG1Grade(t *testing.T) {
	for _, tc := range []struct {
		percent int
		grade   api.Grade5
		ects    api.Ects
	}{
		{100, api.Excellent, api.A}, {90, api.Excellent, api.A},
		{89, api.Good, api.B}, {82, api.Good, api.B},
		{81, api.Good, api.C}, {75, api.Good, api.C},
		{74, api.Satisfactory, api.D}, {67, api.Satisfactory, api.D},
		{66, api.Satisfactory, api.E}, {60, api.Satisfactory, api.E},
		{59, api.Unsatisfactory, api.F}, {0, api.Unsatisfactory, api.F},
	} {
		grade, ects := grading.Grade(tc.percent)
		if grade != tc.grade || ects != tc.ects {
			t.Errorf("Grade(%d) = %s, %s; ожидалось %s, %s", tc.percent, grade, ects, tc.grade, tc.ects)
		}
	}
}

func ptr[T any](v T) *T {
	return &v
}

func TestG2ResultStatus(t *testing.T) {
	for _, tc := range []struct {
		form    api.ControlForm
		percent *int
		passed  *bool
		status  api.SessionResultStatus
	}{
		{api.ControlFormExam, nil, nil, api.Pending},
		{api.ControlFormExam, ptr(59), nil, api.Failed},
		{api.ControlFormExam, ptr(60), nil, api.Passed},
		{api.ControlFormGradedCredit, ptr(75), nil, api.Passed},
		{api.ControlFormCredit, nil, ptr(true), api.Passed},
		{api.ControlFormCredit, nil, ptr(false), api.Failed},
		{api.ControlFormCredit, nil, nil, api.Pending},
	} {
		if got := grading.ResultStatus(tc.form, tc.percent, tc.passed); got != tc.status {
			t.Errorf("ResultStatus(%s, %v, %v) = %s; ожидалось %s", tc.form, tc.percent, tc.passed, got, tc.status)
		}
	}
}

func TestG3AverageGrade5(t *testing.T) {
	for _, tc := range []struct {
		grades []grading.Grade5
		want   *float64
	}{
		{[]grading.Grade5{api.Excellent, api.Good, api.Satisfactory}, ptr(4.00)},
		{[]grading.Grade5{api.Excellent, api.Good}, ptr(4.50)},
		{[]grading.Grade5{}, nil},
	} {
		got := grading.AverageGrade5(tc.grades)
		if (got == nil) != (tc.want == nil) || got != nil && *got != *tc.want {
			t.Errorf("AverageGrade5(%v) = %v; ожидалось %v", tc.grades, got, tc.want)
		}
	}
}

func TestG4Traffic(t *testing.T) {
	for _, tc := range []struct {
		score, maxToDate, attendance int
		traffic                      api.Traffic
		reason                       string
		needed                       int
		achievable                   bool
	}{
		{0, 0, 100, api.Green, "Оценок пока нет", 90, true},
		{50, 60, 90, api.Green, "", 40, true},
		{45, 60, 100, api.Green, "", 45, false},
		{40, 60, 90, api.Yellow, "Набрано меньше 75% возможных баллов", 50, false},
		{36, 60, 90, api.Yellow, "Набрано меньше 75% возможных баллов", 54, false},
		{35, 60, 90, api.Red, "Набрано меньше 60% возможных баллов", 55, false},
		{55, 60, 65, api.Yellow, "Посещаемость ниже 70%", 35, true},
		{55, 60, 45, api.Red, "Посещаемость ниже 50%", 35, true},
		{30, 60, 45, api.Red, "Набрано меньше 60% возможных баллов", 60, false},
		{92, 100, 100, api.Green, "", 0, true},
	} {
		traffic, reason, needed, achievable := grading.Traffic(tc.score, tc.maxToDate, tc.attendance)
		if traffic != tc.traffic || reason != tc.reason || needed != tc.needed || achievable != tc.achievable {
			t.Errorf("Traffic(%d,%d,%d) = %s,%q,%d,%t; ожидалось %s,%q,%d,%t",
				tc.score, tc.maxToDate, tc.attendance, traffic, reason, needed, achievable, tc.traffic, tc.reason, tc.needed, tc.achievable)
		}
	}
}
