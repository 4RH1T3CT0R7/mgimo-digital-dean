package app

import "strings"

type marker struct{ token, label string }

// Порядок важен: в User-Agent Edge и Opera есть «Chrome/», у Chrome — «Safari/», у Android — «Linux», у iPhone — «Mac OS X».
var (
	browsers = []marker{{"YaBrowser/", "Яндекс Браузер"}, {"Edg", "Edge"}, {"OPR/", "Opera"}, {"Firefox/", "Firefox"},
		{"FxiOS/", "Firefox"}, {"CriOS/", "Chrome"}, {"Chrome/", "Chrome"}, {"Safari/", "Safari"}}
	systems = []marker{{"iPhone", "iPhone"}, {"iPad", "iPad"}, {"Android", "Android"}, {"Windows", "Windows"},
		{"Mac OS X", "macOS"}, {"CrOS", "ChromeOS"}, {"Linux", "Linux"}}
)

// deviceLabel — «браузер · система» для списка сеансов. Сам User-Agent не храним (минимизация ПДн).
func deviceLabel(userAgent string) string {
	var parts []string
	for _, list := range [][]marker{browsers, systems} {
		for _, m := range list {
			if strings.Contains(userAgent, m.token) {
				parts = append(parts, m.label)
				break
			}
		}
	}
	if len(parts) == 0 {
		return "Неизвестное устройство"
	}
	return strings.Join(parts, " · ")
}
