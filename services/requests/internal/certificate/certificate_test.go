package certificate_test

import (
	"bytes"
	"os"
	"testing"
	"time"

	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/requests/internal/certificate"
)

func data(verifyURL string) certificate.Data {
	msk := time.FixedZone("MSK", 3*60*60)
	return certificate.Data{Number: "000004", Code: "K7M2QX4PWA", VerifyURL: verifyURL,
		IssuedAt: time.Date(2026, 11, 7, 18, 0, 0, 0, msk), ValidUntil: time.Date(2026, 12, 7, 0, 0, 0, 0, msk),
		FullName: "Лебедева Анна Викторовна", FacultyName: "Факультет международных отношений",
		ProgramCode: "41.03.05", ProgramName: "Международные отношения", StudyLevel: "bachelor", Course: 2,
		StudyForm: "full_time", Funding: "budget", Purpose: "По месту требования"}
}

func TestQRCodeOnlyForAbsoluteVerifyURL(t *testing.T) {
	const url = "https://lk.example/verify/K7M2QX4PWA"
	withQR, err := certificate.Render(data(url))
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Contains(withQR, []byte("/Subtype /Image")) {
		t.Error("с абсолютным адресом проверки в PDF должен быть QR-код")
	}
	if !bytes.Contains(withQR, []byte(url)) {
		t.Error("QR должен быть кликабельной ссылкой на страницу проверки")
	}
	if out := os.Getenv("CERT_PDF_OUT"); out != "" { // для ручной проверки вёрстки
		_ = os.WriteFile(out, withQR, 0o644)
	}

	relative, err := certificate.Render(data("/verify/K7M2QX4PWA"))
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(relative, []byte("/Subtype /Image")) {
		t.Error("с относительным адресом QR не нужен: с телефона его не открыть")
	}
}
