// Package faq — справочник для ИИ-помощника (content/faq.md, формат — docs/tasks/T19-content.md) и поиск по нему.
package faq

import (
	"sort"
	"strings"
	"unicode"
)

// Entry — запись справочника.
type Entry struct {
	ID       string
	Question string
	Answer   string
	Service  string // service_type_id или "" (в файле — «нет»)
}

// Parse разбирает markdown вида:
//
//	## <id>: <Вопрос>
//	<Ответ, 2–5 предложений.>
//	Услуга: <service_type_id или «нет»>
func Parse(md string) []Entry {
	var out []Entry
	for _, block := range strings.Split("\n"+strings.ReplaceAll(md, "\r\n", "\n"), "\n## ")[1:] {
		lines := strings.Split(strings.TrimSpace(block), "\n")
		id, question, ok := strings.Cut(lines[0], ":")
		if !ok {
			continue
		}
		e := Entry{ID: strings.TrimSpace(id), Question: strings.TrimSpace(question)}
		var answer []string
		for _, l := range lines[1:] {
			l = strings.TrimSpace(l)
			if v, ok := strings.CutPrefix(l, "Услуга:"); ok {
				if s := strings.Trim(strings.TrimSpace(v), "«»`"); s != "нет" {
					e.Service = s
				}
				continue
			}
			if l != "" {
				answer = append(answer, l)
			}
		}
		e.Answer = strings.Join(answer, " ")
		if e.ID != "" && e.Answer != "" {
			out = append(out, e)
		}
	}
	return out
}

// Search — до n записей, лучше всего совпадающих с вопросом. Совпадения в вопросе записи весят вдвое больше.
// ponytail: грубые «основы» (первые 5 букв) вместо морфологии — хватает для 25 записей; при большом
// справочнике — полнотекстовый поиск PostgreSQL с русским словарём.
func Search(entries []Entry, query string, n int) []Entry {
	q := stems(query)
	if len(q) == 0 {
		return nil
	}
	type scored struct {
		e     Entry
		score int
	}
	var res []scored
	for _, e := range entries {
		title, body := stems(e.Question), stems(e.Answer)
		score := 0
		for s := range q {
			if title[s] {
				score += 2
			} else if body[s] {
				score++
			}
		}
		if score > 0 {
			res = append(res, scored{e, score})
		}
	}
	sort.SliceStable(res, func(i, j int) bool { return res[i].score > res[j].score })
	out := make([]Entry, 0, n)
	for i := 0; i < len(res) && i < n; i++ {
		out = append(out, res[i].e)
	}
	return out
}

var stopWords = map[string]bool{
	"как": true, "что": true, "где": true, "когда": true, "можно": true, "нужно": true, "надо": true,
	"мне": true, "меня": true, "для": true, "это": true, "или": true, "если": true, "чтобы": true,
	"какие": true, "какой": true, "какая": true, "ли": true, "уже": true, "ещё": true, "еще": true,
}

func stems(text string) map[string]bool {
	out := map[string]bool{}
	for _, w := range strings.FieldsFunc(strings.ToLower(text), func(r rune) bool { return !unicode.IsLetter(r) }) {
		r := []rune(strings.ReplaceAll(w, "ё", "е"))
		if len(r) < 3 || stopWords[w] {
			continue
		}
		if len(r) > 5 {
			r = r[:5]
		}
		out[string(r)] = true
	}
	return out
}
