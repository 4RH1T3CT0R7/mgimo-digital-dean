package app

import (
	"context"
	"errors"
	"io"
	"mime/multipart"
	"net/http"
	"path"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/platform"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/assistant/internal/api"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/assistant/internal/db"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/assistant/internal/knowledge"
)

const (
	MaxFileSize  = 5 << 20 // 5 МБ (assistant.yaml)
	MaxChars     = 300_000 // символов текста в документе
	maxTextBytes = MaxChars * 4
	maxBody      = MaxFileSize + maxTextBytes + 64<<10 // запас на служебные части multipart
)

var moscow = time.FixedZone("Europe/Moscow", 3*60*60)

func fileTooLarge() error {
	return &platform.Error{Status: http.StatusRequestEntityTooLarge, Code: "file_too_large", Message: "Файл больше 5 МБ"}
}

func unsupported(message string) error {
	return &platform.Error{Status: http.StatusUnsupportedMediaType, Code: "unsupported_file_type", Message: message}
}

func invalid(field, message string) error {
	return platform.Validation(map[string]string{field: message})
}

// logAdmin — журнал действий с базой знаний: тип действия, ID и размеры, без названий и текстов.
func logAdmin(ctx context.Context, id platform.Identity, event string, docID uuid.UUID, attrs ...any) {
	platform.Log(ctx).Info("admin", append([]any{"event", event, "id", docID.String(), "role", string(id.Role)}, attrs...)...)
}

func document(r db.ListDocumentsRow) api.KnowledgeDocument {
	return api.KnowledgeDocument{Id: r.ID, Title: r.Title, SourceName: r.SourceName, Chars: int(r.Chars),
		Chunks: int(r.Chunks), AuthorLabel: r.AuthorLabel, CreatedAt: r.CreatedAt.In(moscow), Active: r.Active}
}

func (s *Server) ListKnowledge(ctx context.Context, _ api.ListKnowledgeRequestObject) (api.ListKnowledgeResponseObject, error) {
	if _, err := platform.RequireStaffOrAdmin(ctx); err != nil {
		return nil, err
	}
	rows, err := s.q.ListDocuments(ctx)
	if err != nil {
		return nil, err
	}
	out := make(api.ListKnowledge200JSONResponse, 0, len(rows))
	for _, r := range rows {
		out = append(out, document(r))
	}
	return out, nil
}

type upload struct {
	title, text, fileName string
	file                  []byte
	hasFile               bool
}

// readUpload читает поля title, text и file; размер файла и текста проверяет по ходу чтения.
func readUpload(mr *multipart.Reader) (upload, error) {
	var u upload
	readErr := func(err error) error {
		if _, ok := errors.AsType[*http.MaxBytesError](err); ok {
			return fileTooLarge()
		}
		return invalid("file", "Не удалось прочитать запрос, попробуйте ещё раз")
	}
	if mr == nil {
		return u, platform.Validation(nil)
	}
	for {
		p, err := mr.NextPart()
		if err == io.EOF {
			return u, nil
		}
		if err != nil {
			return u, readErr(err)
		}
		switch p.FormName() {
		case "title":
			b, err := io.ReadAll(io.LimitReader(p, 4<<10))
			if err != nil {
				return u, readErr(err)
			}
			u.title = strings.TrimSpace(string(b))
		case "text":
			b, err := io.ReadAll(io.LimitReader(p, maxTextBytes+1))
			if err != nil {
				return u, readErr(err)
			}
			if len(b) > maxTextBytes {
				return u, invalid("text", "Текст длиннее 300 000 символов — разделите документ на части")
			}
			u.text = string(b)
		case "file":
			b, err := io.ReadAll(io.LimitReader(p, MaxFileSize+1))
			if err != nil {
				return u, readErr(err)
			}
			if len(b) > MaxFileSize {
				return u, fileTooLarge()
			}
			if p.FileName() != "" || len(b) > 0 {
				u.file, u.fileName, u.hasFile = b, cleanFileName(p.FileName()), true
			}
		}
	}
}

func (s *Server) AddKnowledge(ctx context.Context, req api.AddKnowledgeRequestObject) (api.AddKnowledgeResponseObject, error) {
	me, err := platform.RequireStaffOrAdmin(ctx)
	if err != nil {
		return nil, err
	}
	u, err := readUpload(req.Body)
	if err != nil {
		return nil, err
	}
	fields := map[string]string{}
	if n := utf8.RuneCountInString(u.title); n < 3 || n > 200 {
		fields["title"] = "Название — от 3 до 200 символов"
	}
	switch {
	case u.hasFile && strings.TrimSpace(u.text) != "":
		fields["file"] = "Загрузите файл или вставьте текст — что-то одно"
	case !u.hasFile && strings.TrimSpace(u.text) == "":
		fields["text"] = "Загрузите файл или вставьте текст документа"
	}
	if len(fields) != 0 {
		return nil, platform.Validation(fields)
	}

	text, field := knowledge.Normalize(u.text), "text"
	var source *string
	if u.hasFile {
		field, source = "file", &u.fileName
		text, err = knowledge.Extract(u.fileName, u.file)
		switch {
		case errors.Is(err, knowledge.ErrPDF):
			return nil, unsupported("PDF не поддерживается: русский текст из него извлекается с ошибками. Сохраните документ как .docx или .txt")
		case errors.Is(err, knowledge.ErrUnsupported):
			return nil, unsupported("Можно загрузить файл .txt, .md или .docx")
		case err != nil:
			return nil, invalid("file", "Не удалось прочитать файл. Сохраните его заново как .docx или .txt")
		}
	}
	chars := utf8.RuneCountInString(text)
	switch {
	case chars == 0:
		return nil, invalid(field, "В документе нет текста")
	case chars > MaxChars:
		return nil, invalid(field, "Текст длиннее 300 000 символов — разделите документ на части")
	}

	chunks := knowledge.Chunks(text)
	id, now, label := uuid.New(), s.now(), "Деканат"
	if me.Role == platform.RoleAdmin {
		label = "Администрация"
	}
	err = pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		q := s.q.WithTx(tx)
		if err := q.InsertDocument(ctx, db.InsertDocumentParams{ID: id, Title: u.title, SourceName: source, Text: text,
			Chars: int32(chars), AuthorID: me.UserID, AuthorLabel: label, CreatedAt: now}); err != nil {
			return err
		}
		return q.InsertChunks(ctx, db.InsertChunksParams{DocumentID: id, Chunks: chunks})
	})
	if err != nil {
		return nil, err
	}
	logAdmin(ctx, me, "knowledge_added", id, "chars", chars, "chunks", len(chunks))
	return api.AddKnowledge201JSONResponse(document(db.ListDocumentsRow{ID: id, Title: u.title, SourceName: source,
		Chars: int32(chars), AuthorLabel: label, CreatedAt: now, Active: true, Chunks: int64(len(chunks))})), nil
}

func (s *Server) SetKnowledgeActive(ctx context.Context, req api.SetKnowledgeActiveRequestObject) (api.SetKnowledgeActiveResponseObject, error) {
	me, err := platform.RequireStaffOrAdmin(ctx)
	if err != nil {
		return nil, err
	}
	if req.Body == nil {
		return nil, platform.Validation(nil)
	}
	n, err := s.q.SetDocumentActive(ctx, db.SetDocumentActiveParams{ID: req.DocumentId, Active: req.Body.Active})
	if err != nil {
		return nil, err
	}
	if n == 0 {
		return nil, platform.NotFound()
	}
	row, err := s.q.GetDocument(ctx, req.DocumentId)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, platform.NotFound() // удалили между запросами
	}
	if err != nil {
		return nil, err
	}
	logAdmin(ctx, me, "knowledge_active", req.DocumentId, "active", req.Body.Active)
	return api.SetKnowledgeActive200JSONResponse(document(db.ListDocumentsRow(row))), nil
}

func (s *Server) DeleteKnowledge(ctx context.Context, req api.DeleteKnowledgeRequestObject) (api.DeleteKnowledgeResponseObject, error) {
	me, err := platform.RequireStaffOrAdmin(ctx)
	if err != nil {
		return nil, err
	}
	n, err := s.q.DeleteDocument(ctx, req.DocumentId)
	if err != nil {
		return nil, err
	}
	if n == 0 {
		return nil, platform.NotFound()
	}
	logAdmin(ctx, me, "knowledge_deleted", req.DocumentId)
	return api.DeleteKnowledge204Response{}, nil
}

// cleanFileName — только имя без пути и управляющих символов, не длиннее 200 символов.
func cleanFileName(n string) string {
	n = path.Base(strings.ReplaceAll(n, `\`, "/"))
	n = strings.TrimSpace(strings.Map(func(r rune) rune {
		if unicode.IsControl(r) {
			return -1
		}
		return r
	}, n))
	if r := []rune(n); len(r) > 200 {
		n = string(r[len(r)-200:]) // конец имени — с расширением
	}
	if n == "" || n == "." || n == "/" {
		n = "file"
	}
	return n
}
