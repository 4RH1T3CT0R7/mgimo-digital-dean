package app

import (
	"fmt"
	"regexp"
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/requests/internal/api"
)

// ---------- Статусы (data-model.md, Б5) ----------

type actor string

const (
	actorStudent actor = "student"
	actorStaff   actor = "staff" // и сотрудник деканата, и администратор
	actorSystem  actor = "system"
)

type transition struct {
	from, to api.ApplicationStatus
	by       actor
}

// transitions — все допустимые переходы после подачи. Подача (— → submitted/ready) — в CreateApplication.
var transitions = []transition{
	{api.Submitted, api.Cancelled, actorStudent},
	{api.Submitted, api.InProgress, actorStaff},
	{api.Submitted, api.Rejected, actorStaff},
	{api.InProgress, api.NeedsInfo, actorStaff},
	{api.InProgress, api.Ready, actorStaff},
	{api.InProgress, api.Rejected, actorStaff},
	{api.NeedsInfo, api.InProgress, actorStudent}, // сообщением студента
	{api.NeedsInfo, api.InProgress, actorStaff},
	{api.NeedsInfo, api.Rejected, actorStaff},
}

// canTransition — можно ли by перевести заявку из from в to. Любой другой переход → 409 invalid_transition.
func canTransition(from, to api.ApplicationStatus, by actor) bool {
	return slices.Contains(transitions, transition{from, to, by})
}

// allowedTransitions — куда by может перевести заявку сейчас (для кнопок сотрудника).
func allowedTransitions(from api.ApplicationStatus, by actor) []api.ApplicationStatus {
	out := []api.ApplicationStatus{}
	for _, t := range transitions {
		if t.from == from && t.by == by {
			out = append(out, t.to)
		}
	}
	return out
}

// commentRequired — для needs_info и rejected студент должен понять, что делать или почему отказ.
func commentRequired(to api.ApplicationStatus) bool {
	return to == api.NeedsInfo || to == api.Rejected
}

func isTerminal(s api.ApplicationStatus) bool {
	return s == api.Ready || s == api.Rejected || s == api.Cancelled
}

// isOverdue — срок прошёл, а деканат ещё не закончил (в needs_info ждём студента).
func isOverdue(status api.ApplicationStatus, due *time.Time, now time.Time) bool {
	return due != nil && now.After(*due) && (status == api.Submitted || status == api.InProgress)
}

// ---------- Поля формы (ServiceType.fields) ----------

// defaultMaxLength — для полей без max_length: защита от гигантских значений.
const defaultMaxLength = 4000

var numberRe = regexp.MustCompile(`^-?[0-9]+([.,][0-9]+)?$`)

// validateFields проверяет значения по описанию формы. Возвращает очищенные значения
// (только известные поля, без пробелов по краям, без пустых необязательных) и ошибки по ключам.
func validateFields(defs []api.FormField, in map[string]string) (map[string]string, map[string]string) {
	values, errs := map[string]string{}, map[string]string{}
	for _, f := range defs {
		v := strings.TrimSpace(in[f.Key])
		if v == "" {
			if f.Required {
				errs[f.Key] = "Обязательное поле"
			}
			continue
		}
		maxLen := defaultMaxLength
		if f.MaxLength != nil {
			maxLen = *f.MaxLength
		}
		switch {
		case utf8.RuneCountInString(v) > maxLen:
			errs[f.Key] = fmt.Sprintf("Не больше %d символов", maxLen)
		case f.Type == api.Select && (f.Options == nil || !slices.Contains(*f.Options, v)):
			errs[f.Key] = "Выберите значение из списка"
		case f.Type == api.Date && !isDate(v):
			errs[f.Key] = "Дата в формате ГГГГ-ММ-ДД"
		case f.Type == api.Number && !numberRe.MatchString(v):
			errs[f.Key] = "Введите число"
		default:
			values[f.Key] = v
		}
	}
	return values, errs
}

func isDate(v string) bool {
	_, err := time.Parse(time.DateOnly, v)
	return err == nil
}
