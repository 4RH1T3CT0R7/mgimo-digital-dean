package app

import (
	"bytes"
	"context"
	"errors"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"path"
	"strings"
	"unicode"

	"github.com/google/uuid"

	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/platform"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/requests/internal/api"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/requests/internal/db"
)

// allowedTypes — белый список; тип определяется по содержимому, а не по имени файла (security.md §3).
var allowedTypes = map[string]bool{"application/pdf": true, "image/jpeg": true, "image/png": true}

func fileTooLarge() error {
	return &platform.Error{Status: http.StatusRequestEntityTooLarge, Code: "file_too_large", Message: "Файл больше 5 МБ"}
}

func unsupportedType() error {
	return &platform.Error{Status: http.StatusUnsupportedMediaType, Code: "unsupported_file_type",
		Message: "Можно приложить только PDF, JPEG или PNG"}
}

// readErr: тело длиннее лимита MaxBytesReader → 413, прочее — испорченный запрос.
func readErr(err error) error {
	if _, ok := errors.AsType[*http.MaxBytesError](err); ok {
		return fileTooLarge()
	}
	return platform.Validation(map[string]string{"file": "Не удалось прочитать файл"})
}

// saveUpload читает multipart (поле file и, у сотрудника, is_result), проверяет размер и тип и сохраняет файл.
func (s *Server) saveUpload(ctx context.Context, a db.Application, mr *multipart.Reader, role string, by uuid.UUID,
	allowResult bool) (api.Attachment, error) {
	var (
		data     []byte
		name     string
		found    bool
		isResult bool
	)
	for {
		p, err := mr.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			return api.Attachment{}, readErr(err)
		}
		switch {
		case p.FormName() == "file" && !found:
			if data, err = io.ReadAll(io.LimitReader(p, MaxFileSize+1)); err != nil {
				return api.Attachment{}, readErr(err)
			}
			if len(data) > MaxFileSize {
				return api.Attachment{}, fileTooLarge()
			}
			name, found = cleanFileName(p.FileName()), true
		case p.FormName() == "is_result":
			v, err := io.ReadAll(io.LimitReader(p, 16))
			if err != nil {
				return api.Attachment{}, readErr(err)
			}
			isResult = allowResult && strings.TrimSpace(string(v)) == "true"
		}
	}
	if !found {
		return api.Attachment{}, platform.Validation(map[string]string{"file": "Выберите файл"})
	}
	ct := http.DetectContentType(data)
	if !allowedTypes[ct] {
		return api.Attachment{}, unsupportedType()
	}

	id, now := uuid.New(), s.now()
	if err := s.tx(ctx, func(q *db.Queries) error {
		if err := q.InsertAttachment(ctx, db.InsertAttachmentParams{ID: id, ApplicationID: a.ID, UploadedByRole: role,
			UploadedByID: by, FileName: name, ContentType: ct, Size: int32(len(data)), Data: data, IsResult: isResult,
			Now: now}); err != nil {
			return err
		}
		return q.TouchApplication(ctx, db.TouchApplicationParams{ID: a.ID, Now: now})
	}); err != nil {
		return api.Attachment{}, err
	}
	platform.Log(ctx).Info("application", "event", "attachment_added", "application_id", a.ID.String(),
		"attachment_id", id.String(), "content_type", ct, "size", len(data))
	return api.Attachment{Id: id, FileName: name, ContentType: api.AttachmentContentType(ct), Size: len(data),
		UploadedByRole: api.AttachmentUploadedByRole(role), IsResult: isResult, CreatedAt: now.In(msk)}, nil
}

// cleanFileName — только имя без пути и управляющих символов (для Content-Disposition).
func cleanFileName(n string) string {
	n = path.Base(strings.ReplaceAll(n, `\`, "/"))
	n = strings.TrimSpace(strings.Map(func(r rune) rune {
		if unicode.IsControl(r) {
			return -1
		}
		return r
	}, n))
	if r := []rune(n); len(r) > 200 {
		n = string(r[:200])
	}
	if n == "" || n == "." || n == "/" {
		n = "file"
	}
	return n
}

// disposition — всегда attachment: файл скачивается, а не открывается в контексте сайта (security.md §3).
func disposition(name string) string {
	return mime.FormatMediaType("attachment", map[string]string{"filename": name})
}

func fileContent(f db.Attachment) api.FileContentApplicationoctetStreamResponse {
	return api.FileContentApplicationoctetStreamResponse{
		Body: bytes.NewReader(f.Data), ContentLength: int64(len(f.Data)),
		Headers: api.FileContentResponseHeaders{ContentDisposition: disposition(f.FileName)},
	}
}
