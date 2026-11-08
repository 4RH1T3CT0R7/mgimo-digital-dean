package app

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"

	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/events"
)

// replayNamespace — пространство имён для детерминированных ID событий тестовых данных.
var replayNamespace = uuid.MustParse("7d9c4f3e-2a61-4b8e-9f0d-5c3b1a2e8f64")

// ReplaySeedEvents публикует события по данным, которые уже лежат в БД (тестовые данные, T07):
// так уведомления о заявках из seed создаёт сам notifications своим обычным кодом, без ручной синхронизации ID.
// ID событий детерминированы (из ID строки истории или сообщения), поэтому повторный запуск не плодит
// уведомления: notifications идемпотентен по source_event_id (events.md).
func (s *Server) ReplaySeedEvents(ctx context.Context) (published int, err error) {
	if s.bus == nil {
		return 0, errors.New("нет подключения к NATS")
	}

	history, err := s.q.ListStatusHistoryForReplay(ctx)
	if err != nil {
		return 0, err
	}
	var prev *string
	var prevApp uuid.UUID
	for _, h := range history {
		if h.ApplicationID != prevApp {
			prev, prevApp = nil, h.ApplicationID
		}
		e := events.ApplicationStatusChanged{ApplicationID: h.ApplicationID, Number: number(h.Number),
			StudentID: h.StudentID, FacultyID: h.FacultyID, ServiceTypeID: h.ServiceTypeID,
			ServiceTitle: h.ServiceTitle, OldStatus: prev, NewStatus: h.Status, Comment: h.Comment}
		if err := events.PublishWithID(ctx, s.bus, replayID("status:%d", h.ID), e); err != nil {
			return published, err
		}
		status := h.Status
		prev = &status
		published++
	}

	messages, err := s.q.ListStaffMessagesForReplay(ctx)
	if err != nil {
		return published, err
	}
	for _, m := range messages {
		e := events.ApplicationMessageAdded{ApplicationID: m.ApplicationID, Number: number(m.Number),
			StudentID: m.StudentID, ServiceTypeID: m.ServiceTypeID, ServiceTitle: m.ServiceTitle,
			AuthorRole: "staff", AuthorLabel: m.AuthorLabel}
		if err := events.PublishWithID(ctx, s.bus, replayID("message:%s", m.ID), e); err != nil {
			return published, err
		}
		published++
	}
	return published, nil
}

func replayID(format string, a any) uuid.UUID {
	return uuid.NewSHA1(replayNamespace, []byte(fmt.Sprintf(format, a)))
}
