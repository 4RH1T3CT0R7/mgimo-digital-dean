// Package knowledge — текст документа базы знаний (D66): извлечение из файла и нарезка на фрагменты для поиска.
package knowledge

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"errors"
	"io"
	"path"
	"strings"
	"unicode"
	"unicode/utf8"

	"golang.org/x/text/encoding/charmap"
)

var (
	ErrUnsupported = errors.New("knowledge: тип файла не поддерживается")
	ErrPDF         = errors.New("knowledge: PDF не поддерживается")
	ErrBroken      = errors.New("knowledge: файл не читается")
)

// maxXML — предел распакованного word/document.xml: защита от zip-бомбы.
const maxXML = 32 << 20

// Extract — текст файла .txt, .md или .docx. PDF не принимаем: у rsc.io/pdf кириллица из шрифтов
// Identity-H (так сохраняют Word и LibreOffice) приходит кодами глифов, а не буквами.
func Extract(name string, data []byte) (string, error) {
	switch strings.ToLower(path.Ext(name)) {
	case ".txt", ".md":
		data = bytes.TrimPrefix(data, []byte("\xef\xbb\xbf"))
		if !utf8.Valid(data) {
			// Старые файлы «Блокнота» — в Windows-1251
			decoded, err := charmap.Windows1251.NewDecoder().Bytes(data)
			if err != nil {
				return "", ErrBroken
			}
			data = decoded
		}
		return Normalize(string(data)), nil
	case ".docx":
		text, err := docx(data)
		return Normalize(text), err
	case ".pdf":
		return "", ErrPDF
	default:
		return "", ErrUnsupported
	}
}

// docx — текст абзацев из word/document.xml (stdlib: zip + xml).
func docx(data []byte) (string, error) {
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return "", ErrBroken
	}
	f, err := zr.Open("word/document.xml")
	if err != nil {
		return "", ErrBroken
	}
	defer f.Close()
	dec := xml.NewDecoder(io.LimitReader(f, maxXML))
	var b strings.Builder
	inRun, inText := false, false
	for {
		tok, err := dec.Token()
		if err == io.EOF {
			return b.String(), nil
		}
		if err != nil {
			return "", ErrBroken
		}
		switch t := tok.(type) {
		case xml.StartElement:
			switch t.Name.Local {
			case "r":
				inRun = true
			case "t":
				inText = true
			case "tab": // табуляция внутри текста; w:tab в настройках абзаца — не текст
				if inRun {
					b.WriteByte(' ')
				}
			case "br", "cr":
				if inRun {
					b.WriteByte('\n')
				}
			}
		case xml.EndElement:
			switch t.Name.Local {
			case "r":
				inRun = false
			case "t":
				inText = false
			case "p":
				b.WriteByte('\n')
			}
		case xml.CharData:
			if inText {
				b.Write(t)
			}
		}
	}
}

// Normalize — строки без управляющих символов и лишних пробелов, не больше одной пустой строки подряд.
func Normalize(text string) string {
	text = strings.Map(func(r rune) rune {
		switch {
		case r == '\n':
			return r
		case r == '\t':
			return ' '
		case unicode.IsControl(r) || r == 0xFEFF || r == utf8.RuneError:
			return -1
		}
		return r
	}, strings.ReplaceAll(strings.ReplaceAll(text, "\r\n", "\n"), "\r", "\n"))
	var out []string
	for _, line := range strings.Split(text, "\n") {
		line = strings.Join(strings.Fields(line), " ")
		if line == "" && (len(out) == 0 || out[len(out)-1] == "") {
			continue
		}
		out = append(out, line)
	}
	return strings.TrimSpace(strings.Join(out, "\n"))
}

// Размеры фрагмента в символах: фрагмент 900–1200, соседние перекрываются примерно на 150 —
// мысль на стыке не теряется для поиска.
const (
	ChunkMin = 900
	ChunkMax = 1200
	Overlap  = 150
)

// Chunks режет текст на фрагменты по абзацам. Абзац, который не помещается, дорезается по
// концу предложения или пробелу, если фрагмент ещё короче ChunkMin.
func Chunks(text string) []string {
	var paras []string
	for _, line := range strings.Split(text, "\n") {
		if line = strings.TrimSpace(line); line != "" {
			paras = append(paras, line)
		}
	}
	var out []string
	cur := ""
	for len(paras) > 0 {
		p := paras[0]
		room := ChunkMax
		if cur != "" {
			room -= runes(cur) + 1
		}
		if runes(p) <= room {
			cur, paras = join(cur, p), paras[1:]
			continue
		}
		if runes(cur) < ChunkMin {
			head, rest := cut(p, room)
			cur, paras[0] = join(cur, head), rest
		}
		out = append(out, cur)
		cur = tail(cur, Overlap)
	}
	// После каждого среза в cur добавляется новый текст, поэтому хвост без нового текста сюда не попадает
	if cur != "" {
		out = append(out, cur)
	}
	return out
}

func runes(s string) int { return utf8.RuneCountInString(s) }

func join(a, b string) string {
	if a == "" {
		return b
	}
	return a + "\n" + b
}

// cut — начало s не длиннее n символов: по концу предложения, иначе по пробелу, иначе ровно n.
func cut(s string, n int) (head, rest string) {
	r := []rune(s)
	if len(r) <= n {
		return s, ""
	}
	prefix := string(r[:n])
	at := len(prefix) // в байтах
	if i := strings.LastIndexAny(prefix, ".!?;"); i > 0 && runes(prefix[:i]) > n/2 {
		at = i + 1
	} else if i := strings.LastIndexByte(prefix, ' '); i > 0 {
		at = i
	}
	return strings.TrimSpace(s[:at]), strings.TrimSpace(s[at:])
}

// Excerpt — начало текста не длиннее n символов по границе предложения или слова; обрезанное — с «…».
func Excerpt(s string, n int) string {
	head, rest := cut(s, n)
	if rest == "" {
		return head
	}
	return strings.TrimRight(head, ".!?;,: ") + "…"
}

// tail — последние n символов s, начиная с целого слова.
func tail(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	t := string(r[len(r)-n:])
	if i := strings.IndexAny(t, " \n"); i >= 0 && i < len(t)-1 {
		t = t[i+1:]
	}
	return t
}
