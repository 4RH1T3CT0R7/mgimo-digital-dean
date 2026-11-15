// Package certificate — PDF справки с места учёбы (data-model.md, Б6).
// Шрифт PT Sans (ParaType, SIL Open Font License 1.1, см. fonts/OFL.txt) встроен в бинарник:
// кириллица в PDF читается без шрифтов в системе.
package certificate

import (
	"bytes"
	_ "embed"
	"fmt"
	"strings"
	"time"

	"github.com/go-pdf/fpdf"
	"rsc.io/qr"
)

var (
	//go:embed fonts/PT_Sans-Web-Regular.ttf
	fontRegular []byte
	//go:embed fonts/PT_Sans-Web-Bold.ttf
	fontBold []byte
)

const (
	Watermark = "КОНЦЕПТ. НЕ ЯВЛЯЕТСЯ ДОКУМЕНТОМ"
	Footer    = "Сформировано в прототипе для конкурса „Цифровой деканат будущего“"
	font      = "PTSans"
)

// Data — всё, что печатается в справке; данные студента — из слепка заявки.
type Data struct {
	Number      string // номер заявки
	Code        string
	VerifyURL   string
	IssuedAt    time.Time // по Москве
	ValidUntil  time.Time
	FullName    string
	FacultyName string
	ProgramCode string
	ProgramName string
	StudyLevel  string // bachelor | specialist | master
	Course      int
	StudyForm   string // full_time | part_time | extramural
	Funding     string // budget | contract
	Purpose     string // «По месту требования» и т.п.
	Destination string // куда предоставляется, может быть пустым
}

var labels = map[string]string{
	"bachelor": "бакалавриат", "specialist": "специалитет", "master": "магистратура",
	"full_time": "очная", "part_time": "очно-заочная", "extramural": "заочная",
	"budget": "бюджетная", "contract": "договорная",
}

func label(v string) string {
	if l, ok := labels[v]; ok {
		return l
	}
	return v
}

// Render формирует PDF. На каждой странице — водяной знак и подвал.
func Render(d Data) ([]byte, error) {
	pdf := fpdf.New("P", "mm", "A4", "")
	pdf.AddUTF8FontFromBytes(font, "", fontRegular)
	pdf.AddUTF8FontFromBytes(font, "B", fontBold)
	pdf.SetMargins(20, 20, 20)
	pdf.SetAutoPageBreak(true, 25)
	pdf.SetTitle("Справка с места учёбы", true)
	pdf.SetSubject("Код проверки "+d.Code, true)
	pdf.SetKeywords(d.Code, false)
	// Даты документа — явно: иначе fpdf возьмёт time.Now.
	pdf.SetCreationDate(d.IssuedAt)
	pdf.SetModificationDate(d.IssuedAt)

	pdf.SetHeaderFunc(func() {
		// Водяной знак рисуется первым, поэтому он под текстом.
		pdf.SetFont(font, "B", 34)
		pdf.SetTextColor(215, 215, 215)
		pdf.TransformBegin()
		pdf.TransformRotate(55, 105, 148.5)
		pdf.Text(105-pdf.GetStringWidth(Watermark)/2, 148.5, Watermark)
		pdf.TransformEnd()

		pdf.SetFont(font, "", 9)
		pdf.SetTextColor(110, 110, 110)
		pdf.CellFormat(0, 5, "Учебный прототип «Мой вуз»", "", 1, "L", false, 0, "")
		pdf.SetTextColor(0, 0, 0)
		pdf.Ln(12)
	})
	pdf.SetFooterFunc(func() {
		pdf.SetY(-18)
		pdf.SetFont(font, "", 9)
		pdf.SetTextColor(110, 110, 110)
		pdf.CellFormat(0, 5, Footer, "T", 0, "C", false, 0, "")
		pdf.SetTextColor(0, 0, 0)
	})
	pdf.AddPage()

	pdf.SetFont(font, "B", 20)
	pdf.CellFormat(0, 10, "СПРАВКА", "", 1, "C", false, 0, "")
	pdf.SetFont(font, "", 12)
	pdf.CellFormat(0, 7, fmt.Sprintf("с места учёбы № %s от %s", d.Number, d.IssuedAt.Format("02.01.2006")), "", 1, "C", false, 0, "")
	pdf.Ln(10)

	pdf.MultiCell(0, 7, "Настоящая справка подтверждает, что указанное ниже лицо является студентом МГИМО.", "", "L", false)
	pdf.Ln(4)
	rows := [][2]string{
		{"ФИО", d.FullName},
		{"Факультет", d.FacultyName},
		{"Направление подготовки", d.ProgramCode + " «" + d.ProgramName + "»"},
		{"Уровень образования", label(d.StudyLevel)},
		{"Курс", fmt.Sprint(d.Course)},
		{"Форма обучения", label(d.StudyForm)},
		{"Основа обучения", label(d.Funding)},
	}
	purpose := d.Purpose
	if d.Destination != "" {
		purpose += ": " + d.Destination
	}
	if purpose != "" {
		rows = append(rows, [2]string{"Для предоставления", purpose})
	}
	rows = append(rows, [2]string{"Действительна до", d.ValidUntil.Format("02.01.2006")})
	for _, r := range rows {
		pdf.SetFont(font, "B", 12)
		pdf.CellFormat(62, 7, r[0], "", 0, "L", false, 0, "")
		pdf.SetFont(font, "", 12)
		pdf.MultiCell(0, 7, r[1], "", "L", false)
	}

	pdf.Ln(10)
	// QR со ссылкой на проверку: получатель наводит камеру телефона и сразу видит, действительна ли справка.
	// Только для абсолютного адреса — относительный (без SITE_ADDRESS) с телефона не открыть.
	textWidth := 0.0
	if strings.HasPrefix(d.VerifyURL, "http") {
		if code, err := qr.Encode(d.VerifyURL, qr.M); err == nil {
			const size = 38.0
			pdf.RegisterImageOptionsReader("verify-qr", fpdf.ImageOptions{ImageType: "PNG"}, bytes.NewReader(code.PNG()))
			pdf.ImageOptions("verify-qr", 210-20-size, pdf.GetY(), size, size, false, fpdf.ImageOptions{ImageType: "PNG"}, 0, d.VerifyURL)
			textWidth = 210 - 40 - size - 6 // текст не заходит под QR
		}
	}
	pdf.SetFont(font, "", 11)
	pdf.CellFormat(textWidth, 7, "Код проверки", "", 1, "L", false, 0, "")
	pdf.SetFont(font, "B", 22)
	pdf.CellFormat(textWidth, 12, d.Code, "", 1, "L", false, 0, "")
	pdf.SetFont(font, "", 11)
	pdf.MultiCell(textWidth, 6, "Проверить подлинность справки: "+d.VerifyURL, "", "L", false)

	var buf bytes.Buffer
	if err := pdf.Output(&buf); err != nil {
		return nil, fmt.Errorf("pdf: %w", err)
	}
	return buf.Bytes(), nil
}
