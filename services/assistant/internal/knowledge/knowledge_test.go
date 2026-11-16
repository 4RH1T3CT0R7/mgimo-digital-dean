package knowledge_test

import (
	"archive/zip"
	"bytes"
	"errors"
	"fmt"
	"strings"
	"testing"
	"unicode/utf8"

	"golang.org/x/text/encoding/charmap"

	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/assistant/internal/knowledge"
)

// paragraph — абзац примерно из n символов с уникальными словами, чтобы проверить, что ничего не потерялось.
func paragraph(id, n int) string {
	var b strings.Builder
	for i := 0; b.Len() < n*2; i++ { // кириллица — 2 байта на символ
		fmt.Fprintf(&b, "слово%dх%d ", id, i)
		if i%9 == 8 {
			b.WriteString("Конец предложения. ")
		}
	}
	return strings.TrimSpace(b.String())
}

func TestChunks(t *testing.T) {
	if got := knowledge.Chunks(""); len(got) != 0 {
		t.Fatalf("пустой текст: %q", got)
	}
	if got := knowledge.Chunks("Короткий документ.\nВторой абзац."); len(got) != 1 || got[0] != "Короткий документ.\nВторой абзац." {
		t.Fatalf("короткий текст — один фрагмент как есть: %q", got)
	}

	var paras []string
	for i, n := range []int{300, 700, 80, 1500, 2600, 400, 950, 120, 60, 1100} {
		paras = append(paras, paragraph(i, n))
	}
	text := strings.Join(paras, "\n\n")
	chunks := knowledge.Chunks(text)
	if len(chunks) < 8 {
		t.Fatalf("ждали много фрагментов, получили %d", len(chunks))
	}
	for i, c := range chunks {
		n := utf8.RuneCountInString(c)
		if n > knowledge.ChunkMax {
			t.Errorf("фрагмент %d длиннее %d: %d", i, knowledge.ChunkMax, n)
		}
		if i < len(chunks)-1 && n < knowledge.ChunkMin {
			t.Errorf("фрагмент %d короче %d: %d", i, knowledge.ChunkMin, n)
		}
		if i > 0 {
			prev := []rune(chunks[i-1])
			overlap := 0
			for k := knowledge.Overlap; k > 0; k-- {
				if k <= len(prev) && strings.HasPrefix(c, string(prev[len(prev)-k:])) {
					overlap = k
					break
				}
			}
			if overlap < knowledge.Overlap-30 {
				t.Errorf("фрагмент %d перекрывается с предыдущим на %d символов, ждали около %d", i, overlap, knowledge.Overlap)
			}
		}
	}
	all := strings.Join(chunks, " ")
	for _, w := range strings.Fields(text) {
		if !strings.Contains(all, w) {
			t.Fatalf("слово %q потерялось", w)
		}
	}
}

func TestNormalize(t *testing.T) {
	got := knowledge.Normalize("\xef\xbb\xbf  Заголовок\r\n\r\n\r\n\tТекст  с\xc2\xa0пробелами\x07\n\n")
	if got != "Заголовок\n\nТекст с пробелами" {
		t.Fatalf("%q", got)
	}
}

func docxFile(t *testing.T, documentXML string) []byte {
	t.Helper()
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	for name, body := range map[string]string{
		"[Content_Types].xml": `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>`,
		"word/document.xml":   documentXML,
	} {
		w, err := zw.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		_, _ = w.Write([]byte(body))
	}
	if err := zw.Close(); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func TestExtractDocx(t *testing.T) {
	doc := docxFile(t, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
<w:p><w:pPr><w:tabs><w:tab w:val="left" w:pos="720"/></w:tabs></w:pPr><w:r><w:t>Порядок пересдач</w:t></w:r></w:p>
<w:p><w:r><w:t xml:space="preserve">Пересдача назначается </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>деканатом</w:t></w:r><w:r><w:tab/><w:t>в течение</w:t><w:br/><w:t>двух недель.</w:t></w:r></w:p>
</w:body></w:document>`)
	got, err := knowledge.Extract("Пересдачи.DOCX", doc)
	if err != nil {
		t.Fatal(err)
	}
	if want := "Порядок пересдач\nПересдача назначается деканатом в течение\nдвух недель."; got != want {
		t.Fatalf("docx:\n%q\nждали\n%q", got, want)
	}
}

func TestExtractErrors(t *testing.T) {
	cp1251, _ := charmap.Windows1251.NewEncoder().String("Справка в Блокноте")
	if got, err := knowledge.Extract("старый.txt", []byte(cp1251)); err != nil || got != "Справка в Блокноте" {
		t.Errorf("Windows-1251: %q %v", got, err)
	}
	if got, err := knowledge.Extract("памятка.md", []byte("\xef\xbb\xbf# Памятка\n")); err != nil || got != "# Памятка" {
		t.Errorf("md с BOM: %q %v", got, err)
	}
	cases := []struct {
		name string
		data []byte
		want error
	}{
		{"приказ.pdf", []byte("%PDF-1.7"), knowledge.ErrPDF},
		{"таблица.xlsx", []byte("PK"), knowledge.ErrUnsupported},
		{"без-расширения", []byte("текст"), knowledge.ErrUnsupported},
		{"сломанный.docx", []byte("не zip"), knowledge.ErrBroken},
		{"пустой-архив.docx", docxFile(t, "<w:document"), knowledge.ErrBroken},
	}
	for _, c := range cases {
		if _, err := knowledge.Extract(c.name, c.data); !errors.Is(err, c.want) {
			t.Errorf("%s: %v, ждали %v", c.name, err, c.want)
		}
	}
}
