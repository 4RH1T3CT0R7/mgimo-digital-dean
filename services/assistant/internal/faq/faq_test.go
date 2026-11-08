package faq_test

import (
	"testing"

	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/assistant/internal/faq"
)

const sample = "# Справочник\r\n\r\n" +
	"## academic-leave: Как оформить академический отпуск?\r\n" +
	"Подайте заявление «Академический отпуск» в кабинете. Приложите документы, если основание медицинское.\r\n" +
	"Услуга: academic-leave\r\n\r\n" +
	"## military: Где взять справку для военкомата?\n" +
	"Закажите «Справку в военкомат» — деканат подготовит её за 5 дней.\n" +
	"Услуга: military-certificate\n\n" +
	"## schedule-change: Где смотреть переносы пар?\n" +
	"Переносы выделены в расписании и приходят уведомлением.\n" +
	"Услуга: нет\n"

func TestParse(t *testing.T) {
	es := faq.Parse(sample)
	if len(es) != 3 {
		t.Fatalf("записей %d, ждали 3: %+v", len(es), es)
	}
	if es[0].ID != "academic-leave" || es[0].Question != "Как оформить академический отпуск?" || es[0].Service != "academic-leave" {
		t.Errorf("первая запись: %+v", es[0])
	}
	if es[2].Service != "" {
		t.Errorf("«Услуга: нет» → пустая услуга, получили %q", es[2].Service)
	}
	if es[1].Answer != "Закажите «Справку в военкомат» — деканат подготовит её за 5 дней." {
		t.Errorf("ответ без строки «Услуга»: %q", es[1].Answer)
	}
}

func TestSearch(t *testing.T) {
	es := faq.Parse(sample)
	cases := []struct {
		q    string
		want string // ID первой записи или "" — ничего не найдено
	}{
		{"как уйти в академ", "academic-leave"},
		{"Академический отпуск по болезни", "academic-leave"},
		{"справка для военкомата", "military"},
		{"куда перенесли пару?", "schedule-change"},
		{"какая погода завтра", ""},
		{"как?", ""},
	}
	for _, c := range cases {
		got := faq.Search(es, c.q, 3)
		switch {
		case c.want == "" && len(got) != 0:
			t.Errorf("%q: ждали пусто, получили %s", c.q, got[0].ID)
		case c.want != "" && (len(got) == 0 || got[0].ID != c.want):
			t.Errorf("%q: ждали %s первым, получили %+v", c.q, c.want, got)
		}
	}
}
