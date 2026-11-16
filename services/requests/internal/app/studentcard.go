package app

import (
	"bytes"
	"context"
	"crypto/rand"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"rsc.io/qr"

	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/platform"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/requests/internal/api"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/requests/internal/db"
)

// Электронный студенческий учебного прототипа (D60): данные — из academic, код проверки — наш, как у справки.

const studentCardTitle = "Электронный студенческий билет"

func (s *Server) GetMyStudentCard(ctx context.Context, _ api.GetMyStudentCardRequestObject) (api.GetMyStudentCardResponseObject, error) {
	me, err := platform.RequireStudent(ctx)
	if err != nil {
		return nil, err
	}
	card, err := s.studentCard(ctx, me.UserID)
	if err != nil {
		return nil, err
	}
	now := s.now()
	// Код из запроса сохранится только при первой выдаче; дальше остаётся прежний (ON CONFLICT в запросе).
	// ponytail: коды справок и студенческих — разные таблицы; совпадение 50-битных кодов не проверяем, вероятность ничтожна.
	c, err := s.q.UpsertStudentCard(ctx, db.UpsertStudentCardParams{StudentID: me.UserID, Code: rand.Text()[:10],
		Holder: card.ShortName, FacultyShort: card.FacultyShort, Course: int32(card.Course), Now: now,
		ValidUntil: pgtype.Date{Time: academicYearEnd(now), Valid: true}})
	if err != nil {
		return nil, err
	}
	out := api.GetMyStudentCard200JSONResponse{Number: card.StudentCardNo, FullName: card.FullName,
		FacultyName: card.FacultyName, ProgramCode: card.ProgramCode, ProgramName: card.ProgramName, Course: card.Course,
		StudyForm: api.StudentCardStudyForm(card.StudyForm), Code: c.Code, VerifyUrl: verifyPath(c.Code)}
	out.ValidUntil.Time = c.ValidUntil.Time
	return out, nil
}

// GetMyStudentCardQr — QR с полным адресом проверки; рисует та же библиотека, что QR в PDF справки.
func (s *Server) GetMyStudentCardQr(ctx context.Context, _ api.GetMyStudentCardQrRequestObject) (api.GetMyStudentCardQrResponseObject, error) {
	me, err := platform.RequireStudent(ctx)
	if err != nil {
		return nil, err
	}
	code, err := s.q.GetStudentCardCode(ctx, me.UserID)
	if err != nil {
		return nil, notFound(err)
	}
	q, err := qr.Encode(s.siteURL+verifyPath(code), qr.M)
	if err != nil {
		return nil, err
	}
	png := q.PNG()
	return api.GetMyStudentCardQr200ImagepngResponse{Body: bytes.NewReader(png), ContentLength: int64(len(png))}, nil
}

// verifyStudentCard — публичная проверка студенческого: как у справки, плюс курс.
func (s *Server) verifyStudentCard(ctx context.Context, code string, now time.Time) (api.VerifyCertificateResponseObject, error) {
	c, err := s.q.GetStudentCardByCode(ctx, code)
	if err != nil {
		return nil, notFound(err)
	}
	course := int(c.Course)
	out := api.VerifyCertificate200JSONResponse{Kind: api.CertificateVerificationKindStudentCard,
		Valid: !dateMSK(now).After(c.ValidUntil.Time), Title: studentCardTitle, Holder: c.Holder,
		FacultyShort: c.FacultyShort, Course: &course, IssuedAt: c.IssuedAt.In(msk)}
	out.ValidUntil.Time = c.ValidUntil.Time
	return out, nil
}

// academicYearEnd — 31 августа текущего учебного года (учебный год начинается 1 сентября).
func academicYearEnd(now time.Time) time.Time {
	y, m, _ := now.In(msk).Date()
	if m >= time.September {
		y++
	}
	return time.Date(y, time.August, 31, 0, 0, 0, 0, time.UTC)
}
