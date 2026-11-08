package app

import (
	"fmt"
	"maps"
	"net/netip"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/requests/internal/api"
)

var allStatuses = []api.ApplicationStatus{api.Submitted, api.InProgress, api.NeedsInfo, api.Ready, api.Rejected, api.Cancelled}

// Таблица Б5 из data-model.md, записанная независимо от реализации: «из>в:кто».
var b5 = map[string]bool{
	"submitted>cancelled:student":    true,
	"submitted>in_progress:staff":    true,
	"submitted>rejected:staff":       true,
	"in_progress>needs_info:staff":   true,
	"in_progress>ready:staff":        true,
	"in_progress>rejected:staff":     true,
	"needs_info>in_progress:student": true,
	"needs_info>in_progress:staff":   true,
	"needs_info>rejected:staff":      true,
}

// Все пары статусов для каждого участника: разрешено ровно то, что в таблице Б5.
func TestTransitionsAllPairs(t *testing.T) {
	for _, by := range []actor{actorStudent, actorStaff, actorSystem} {
		for _, from := range allStatuses {
			for _, to := range allStatuses {
				key := fmt.Sprintf("%s>%s:%s", from, to, by)
				if got := canTransition(from, to, by); got != b5[key] {
					t.Errorf("%s: canTransition = %v, по Б5 %v", key, got, b5[key])
				}
			}
		}
	}
}

func TestAllowedTransitionsForStaff(t *testing.T) {
	want := map[api.ApplicationStatus][]api.ApplicationStatus{
		api.Submitted:  {api.InProgress, api.Rejected},
		api.InProgress: {api.NeedsInfo, api.Ready, api.Rejected},
		api.NeedsInfo:  {api.InProgress, api.Rejected},
		api.Ready:      {}, api.Rejected: {}, api.Cancelled: {},
	}
	for _, from := range allStatuses {
		got := allowedTransitions(from, actorStaff)
		slices.Sort(got)
		w := slices.Sorted(slices.Values(want[from]))
		if !slices.Equal(got, w) {
			t.Errorf("%s: %v, ожидалось %v", from, got, w)
		}
	}
}

func TestTerminalAndCommentRules(t *testing.T) {
	for _, s := range allStatuses {
		terminal := s == api.Ready || s == api.Rejected || s == api.Cancelled
		if isTerminal(s) != terminal {
			t.Errorf("isTerminal(%s) = %v", s, isTerminal(s))
		}
		// из конечного статуса никуда
		if terminal && len(allowedTransitions(s, actorStaff))+len(allowedTransitions(s, actorStudent)) > 0 {
			t.Errorf("из конечного %s есть переходы", s)
		}
		if commentRequired(s) != (s == api.NeedsInfo || s == api.Rejected) {
			t.Errorf("commentRequired(%s) = %v", s, commentRequired(s))
		}
	}
}

func TestOverdue(t *testing.T) {
	now := time.Date(2026, 11, 20, 12, 0, 0, 0, msk)
	past, future := now.Add(-time.Minute), now.Add(time.Minute)
	cases := []struct {
		status api.ApplicationStatus
		due    *time.Time
		want   bool
	}{
		{api.Submitted, &past, true},
		{api.InProgress, &past, true},
		{api.NeedsInfo, &past, false}, // ждём студента
		{api.Ready, &past, false},
		{api.Submitted, &future, false},
		{api.Submitted, nil, false},
	}
	for _, c := range cases {
		if got := isOverdue(c.status, c.due, now); got != c.want {
			t.Errorf("%s, due=%v: %v, ожидалось %v", c.status, c.due, got, c.want)
		}
	}
}

func TestValidateFields(t *testing.T) {
	ptr := func(v int) *int { return &v }
	opts := []string{"Утерян", "Повреждён"}
	defs := []api.FormField{
		{Key: "reason", Label: "Причина", Type: api.Select, Required: true, Options: &opts},
		{Key: "start_date", Label: "С какой даты", Type: api.Date, Required: true},
		{Key: "details", Label: "Подробности", Type: api.Textarea, MaxLength: ptr(10)},
		{Key: "amount", Label: "Сумма", Type: api.Number},
		{Key: "note", Label: "Примечание", Type: api.Text},
	}
	ok := map[string]string{"reason": "Утерян", "start_date": "2026-12-01"}
	cases := []struct {
		name    string
		in      map[string]string
		errKeys []string
	}{
		{"всё верно", ok, nil},
		{"обязательное пустое", map[string]string{"reason": "  ", "start_date": "2026-12-01"}, []string{"reason"}},
		{"обязательное отсутствует", map[string]string{"reason": "Утерян"}, []string{"start_date"}},
		{"неверный option", map[string]string{"reason": "Украден", "start_date": "2026-12-01"}, []string{"reason"}},
		{"неверная дата", map[string]string{"reason": "Утерян", "start_date": "01.12.2026"}, []string{"start_date"}},
		{"несуществующая дата", map[string]string{"reason": "Утерян", "start_date": "2026-02-30"}, []string{"start_date"}},
		{"превышение max_length", map[string]string{"reason": "Утерян", "start_date": "2026-12-01", "details": "одиннадцать"}, []string{"details"}},
		{"ровно max_length (кириллица)", map[string]string{"reason": "Утерян", "start_date": "2026-12-01", "details": "десятьбукв"}, nil},
		{"не число", map[string]string{"reason": "Утерян", "start_date": "2026-12-01", "amount": "12abc"}, []string{"amount"}},
		{"число", map[string]string{"reason": "Утерян", "start_date": "2026-12-01", "amount": "12.5"}, nil},
		{"длина по умолчанию", map[string]string{"reason": "Утерян", "start_date": "2026-12-01", "note": strings.Repeat("я", defaultMaxLength+1)}, []string{"note"}},
		{"всё сразу", map[string]string{"details": "слишком длинно"}, []string{"details", "reason", "start_date"}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			_, errs := validateFields(defs, c.in)
			if got := slices.Sorted(maps.Keys(errs)); !slices.Equal(got, c.errKeys) {
				t.Errorf("ошибки по полям %v (%v), ожидались %v", got, errs, c.errKeys)
			}
		})
	}

	values, _ := validateFields(defs, map[string]string{"reason": " Утерян ", "start_date": "2026-12-01", "unknown": "x", "note": ""})
	if want := map[string]string{"reason": "Утерян", "start_date": "2026-12-01"}; !maps.Equal(values, want) {
		t.Errorf("очищенные значения %v, ожидались %v", values, want)
	}
}

func TestLimiter(t *testing.T) {
	var l limiter
	now := time.Date(2026, 11, 20, 12, 0, 10, 0, msk)
	ip, other := netip.MustParseAddr("10.0.0.1"), netip.MustParseAddr("10.0.0.2")
	for i := range VerifyPerMinute {
		if ok, _ := l.allow(ip, now); !ok {
			t.Fatalf("запрос %d отклонён", i+1)
		}
	}
	ok, retry := l.allow(ip, now)
	if ok || retry != 51 {
		t.Fatalf("31-й запрос: ok=%v retry=%d, ожидалось false, 51", ok, retry)
	}
	if ok, _ := l.allow(other, now); !ok {
		t.Fatal("другой IP не должен ограничиваться")
	}
	if ok, _ := l.allow(ip, now.Add(time.Minute)); !ok {
		t.Fatal("в новой минуте лимит должен сброситься")
	}
}
