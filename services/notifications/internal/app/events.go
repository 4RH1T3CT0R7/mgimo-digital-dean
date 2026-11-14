package app

import (
	"context"
	"errors"
	"slices"
	"time"

	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/events"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/notifications/internal/db"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/notifications/internal/rules"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

// Subscribe регистрирует все три обработчика. При сбое запуска остановит уже созданные подписки.
func (s *Server) Subscribe(ctx context.Context, bus *events.Bus) (func(), error) {
	stopLesson, err := events.Subscribe(ctx, bus, "notifications", s.receiveLesson)
	if err != nil {
		return nil, err
	}
	stopStatus, err := events.Subscribe(ctx, bus, "notifications", s.receiveStatus)
	if err != nil {
		stopLesson()
		return nil, err
	}
	stopMessage, err := events.Subscribe(ctx, bus, "notifications", s.receiveMessage)
	if err != nil {
		stopStatus()
		stopLesson()
		return nil, err
	}
	return func() { stopMessage(); stopStatus(); stopLesson() }, nil
}

func (s *Server) receiveLesson(ctx context.Context, e events.Envelope[events.LessonChanged]) error {
	n, ok := rules.Render(e.Data)
	if !ok || len(e.Data.GroupIDs) == 0 {
		return nil
	}
	// Одинаковый порядок блокировок при повторной доставке.
	groups := slices.Clone(e.Data.GroupIDs)
	slices.SortFunc(groups, func(a, b uuid.UUID) int { return slices.Compare(a[:], b[:]) })
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return errors.New("не удалось открыть транзакцию уведомлений")
	}
	defer tx.Rollback(ctx)
	q := s.q.WithTx(tx)
	for _, group := range slices.Compact(groups) {
		n.Audience.GroupId = &group
		if err := insertEvent(ctx, q, n, e.ID, e.OccurredAt); err != nil {
			return err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return errors.New("не удалось сохранить уведомления групп")
	}
	return nil
}

func (s *Server) receiveStatus(ctx context.Context, e events.Envelope[events.ApplicationStatusChanged]) error {
	return s.receivePersonal(ctx, e.Data, e.ID, e.OccurredAt)
}

func (s *Server) receiveMessage(ctx context.Context, e events.Envelope[events.ApplicationMessageAdded]) error {
	return s.receivePersonal(ctx, e.Data, e.ID, e.OccurredAt)
}

func (s *Server) receivePersonal(ctx context.Context, event events.Event, id uuid.UUID, at time.Time) error {
	n, ok := rules.Render(event)
	if !ok {
		return nil
	}
	return insertEvent(ctx, s.q, n, id, at)
}

func insertEvent(ctx context.Context, q *db.Queries, n rules.Notification, id uuid.UUID, at time.Time) error {
	date := pgtype.Date{}
	if n.Link.Date != nil {
		date = pgtype.Date{Time: n.Link.Date.Time, Valid: true}
	}
	err := q.InsertEventNotification(ctx, db.InsertEventNotificationParams{
		Type: string(n.Type), Title: truncate(n.Title, 120), Body: truncate(n.Body, 4000), Important: n.Important,
		LinkKind: string(n.Link.Kind), LinkID: n.Link.Id, LinkDate: date,
		AudienceKind: string(n.Audience.Kind), AudienceUserID: n.Audience.UserId, AudienceFacultyID: n.Audience.FacultyId,
		AudienceGroupID: n.Audience.GroupId, SourceEventID: &id, CreatedAt: at, AuthorLabel: n.AuthorLabel,
	})
	if err != nil {
		// Подписчик пишет ошибку в лог. Текст уведомления в лог не передаём.
		return errors.New("не удалось сохранить уведомление")
	}
	return nil
}

func truncate(value string, limit int) string {
	for i := range value {
		if limit == 0 {
			return value[:i]
		}
		limit--
	}
	return value
}
