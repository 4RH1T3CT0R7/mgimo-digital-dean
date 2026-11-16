package app

import (
	"context"
	"errors"
	"time"

	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/platform"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/notifications/internal/api"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/notifications/internal/db"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/oapi-codegen/runtime/types"
)

func (s *Server) GetMyFeed(ctx context.Context, req api.GetMyFeedRequestObject) (api.GetMyFeedResponseObject, error) {
	m, err := s.membership(ctx)
	if err != nil {
		return nil, err
	}
	limit, offset, err := pagination(req.Params.Limit, req.Params.Offset)
	if err != nil {
		return nil, err
	}
	// Без type — лента «Уведомлений»: новости живут в своём разделе (D61) и приходят только по type=news.
	typesFilter := []string{string(api.FeedItemTypeAnnouncement), string(api.FeedItemTypeApplicationMessage),
		string(api.FeedItemTypeApplicationStatus), string(api.FeedItemTypeScheduleChange)}
	if req.Params.Type != nil && len(*req.Params.Type) > 0 {
		typesFilter = typesFilter[:0:0]
		for _, kind := range *req.Params.Type {
			switch kind {
			case api.FeedItemTypeAnnouncement, api.FeedItemTypeNews, api.FeedItemTypeApplicationMessage,
				api.FeedItemTypeApplicationStatus, api.FeedItemTypeScheduleChange:
				typesFilter = append(typesFilter, string(kind))
			default:
				return nil, platform.Validation(map[string]string{"type": "Неизвестный тип уведомления"})
			}
		}
	}
	unreadOnly := req.Params.UnreadOnly != nil && *req.Params.UnreadOnly
	now := s.now()
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	q := s.q.WithTx(tx)
	total, err := q.CountFeed(ctx, db.CountFeedParams{
		StudentID: m.StudentId, FacultyID: m.FacultyId, Course: int32(m.Course), GroupIds: m.GroupIds,
		Types: typesFilter, UnreadOnly: unreadOnly, Now: now,
	})
	if err != nil {
		return nil, err
	}
	rows, err := q.ListFeed(ctx, db.ListFeedParams{
		StudentID: m.StudentId, FacultyID: m.FacultyId, Course: int32(m.Course), GroupIds: m.GroupIds,
		Types: typesFilter, UnreadOnly: unreadOnly, Now: now, PageLimit: limit, PageOffset: offset,
	})
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	items := make([]api.FeedItem, 0, len(rows))
	for _, row := range rows {
		n := row.Notification
		link := api.Link{Kind: api.LinkKind(n.LinkKind), Id: n.LinkID}
		if n.LinkDate.Valid {
			link.Date = &types.Date{Time: n.LinkDate.Time}
		}
		item := api.FeedItem{
			Id: n.ID, Type: api.FeedItemType(n.Type), Title: n.Title, Body: n.Body,
			Important: n.Important, RequiresAck: n.RequiresAck, AuthorLabel: n.AuthorLabel,
			Link: link, CreatedAt: n.CreatedAt.In(moscow), ReadAt: inMoscow(row.ReadAt), AckedAt: inMoscow(row.AckedAt),
		}
		if n.EventStartsAt != nil && n.EventPlace != nil {
			item.Event = &api.FeedEvent{StartsAt: n.EventStartsAt.In(moscow), Place: *n.EventPlace,
				GoingCount: int(row.GoingCount), Going: row.GoingAt != nil}
		}
		items = append(items, item)
	}
	return api.GetMyFeed200JSONResponse{Items: items, Total: int(total)}, nil
}

func (s *Server) GetMyFeedCounters(ctx context.Context, _ api.GetMyFeedCountersRequestObject) (api.GetMyFeedCountersResponseObject, error) {
	m, err := s.membership(ctx)
	if err != nil {
		return nil, err
	}
	now := s.now()
	counter, err := s.q.FeedCounters(ctx, db.FeedCountersParams{
		StudentID: m.StudentId, FacultyID: m.FacultyId, Course: int32(m.Course), GroupIds: m.GroupIds, Now: now,
	})
	if err != nil {
		return nil, err
	}
	deadlines, err := s.q.CountMyDeadlines(ctx, db.CountMyDeadlinesParams{
		FromAt: now, ToAt: now.Add(72 * time.Hour), StudentID: m.StudentId, FacultyID: m.FacultyId,
		Course: int32(m.Course), GroupIds: m.GroupIds,
	})
	if err != nil {
		return nil, err
	}
	return api.GetMyFeedCounters200JSONResponse{
		Unread: int(counter.Unread), ImportantUnacked: int(counter.ImportantUnacked), DeadlinesSoon: int(deadlines),
	}, nil
}

func (s *Server) mark(ctx context.Context, itemID uuid.UUID, ack bool) error {
	m, err := s.membership(ctx)
	if err != nil {
		return err
	}
	now := s.now()
	count, err := s.q.MarkRead(ctx, db.MarkReadParams{
		ItemID: itemID, StudentID: m.StudentId, FacultyID: m.FacultyId, Course: int32(m.Course),
		GroupIds: m.GroupIds, MarkedAt: now, Ack: ack,
	})
	if err != nil || count != 0 {
		return err
	}
	if ack {
		_, err := s.q.FindVisibleNotification(ctx, db.FindVisibleNotificationParams{
			ItemID: itemID, StudentID: m.StudentId, FacultyID: m.FacultyId, Course: int32(m.Course), GroupIds: m.GroupIds, Now: now,
		})
		if err == nil {
			return platform.Conflict("conflict", "Это уведомление не требует подтверждения")
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return err
		}
	}
	return platform.NotFound()
}

func (s *Server) MarkFeedItemRead(ctx context.Context, req api.MarkFeedItemReadRequestObject) (api.MarkFeedItemReadResponseObject, error) {
	if err := s.mark(ctx, req.ItemId, false); err != nil {
		return nil, err
	}
	return api.MarkFeedItemRead204Response{}, nil
}

func (s *Server) AckFeedItem(ctx context.Context, req api.AckFeedItemRequestObject) (api.AckFeedItemResponseObject, error) {
	if err := s.mark(ctx, req.ItemId, true); err != nil {
		return nil, err
	}
	return api.AckFeedItem204Response{}, nil
}

// going — «Пойду» (going=true) или отмена. Видимый элемент без будущего мероприятия — 409, невидимый — 404.
func (s *Server) going(ctx context.Context, itemID uuid.UUID, going bool) error {
	m, err := s.membership(ctx)
	if err != nil {
		return err
	}
	now := s.now()
	count, err := s.q.SetGoing(ctx, db.SetGoingParams{
		ItemID: itemID, StudentID: m.StudentId, FacultyID: m.FacultyId, Course: int32(m.Course),
		GroupIds: m.GroupIds, MarkedAt: now, Going: going,
	})
	if err != nil || count != 0 {
		return err
	}
	_, err = s.q.FindVisibleNotification(ctx, db.FindVisibleNotificationParams{
		ItemID: itemID, StudentID: m.StudentId, FacultyID: m.FacultyId, Course: int32(m.Course), GroupIds: m.GroupIds, Now: now,
	})
	if err == nil {
		return platform.Conflict("conflict", "Это не мероприятие или оно уже прошло")
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	return platform.NotFound()
}

func (s *Server) MarkFeedItemGoing(ctx context.Context, req api.MarkFeedItemGoingRequestObject) (api.MarkFeedItemGoingResponseObject, error) {
	if err := s.going(ctx, req.ItemId, true); err != nil {
		return nil, err
	}
	return api.MarkFeedItemGoing204Response{}, nil
}

func (s *Server) UnmarkFeedItemGoing(ctx context.Context, req api.UnmarkFeedItemGoingRequestObject) (api.UnmarkFeedItemGoingResponseObject, error) {
	if err := s.going(ctx, req.ItemId, false); err != nil {
		return nil, err
	}
	return api.UnmarkFeedItemGoing204Response{}, nil
}

func (s *Server) MarkAllFeedRead(ctx context.Context, _ api.MarkAllFeedReadRequestObject) (api.MarkAllFeedReadResponseObject, error) {
	m, err := s.membership(ctx)
	if err != nil {
		return nil, err
	}
	if err := s.q.MarkAllRead(ctx, db.MarkAllReadParams{
		StudentID: m.StudentId, FacultyID: m.FacultyId, Course: int32(m.Course), GroupIds: m.GroupIds, MarkedAt: s.now(),
	}); err != nil {
		return nil, err
	}
	return api.MarkAllFeedRead204Response{}, nil
}

func deadline(row db.Deadline, now time.Time) api.Deadline {
	return api.Deadline{Id: row.ID, Title: row.Title, Description: row.Description,
		Kind: api.DeadlineKind(row.Kind), DueAt: row.DueAt.In(moscow), DaysLeft: daysLeft(now, row.DueAt), ServiceTypeId: row.ServiceTypeID}
}

func (s *Server) GetMyDeadlines(ctx context.Context, req api.GetMyDeadlinesRequestObject) (api.GetMyDeadlinesResponseObject, error) {
	m, err := s.membership(ctx)
	if err != nil {
		return nil, err
	}
	days := 14
	if req.Params.Days != nil {
		days = *req.Params.Days
	}
	if days < 1 || days > 90 {
		return nil, platform.Validation(map[string]string{"days": "Укажите число от 1 до 90"})
	}
	now := s.now()
	rows, err := s.q.ListMyDeadlines(ctx, db.ListMyDeadlinesParams{
		FromAt: now, ToAt: now.Add(time.Duration(days) * 24 * time.Hour), StudentID: m.StudentId, FacultyID: m.FacultyId,
		Course: int32(m.Course), GroupIds: m.GroupIds,
	})
	if err != nil {
		return nil, err
	}
	items := make(api.GetMyDeadlines200JSONResponse, 0, len(rows))
	for _, row := range rows {
		items = append(items, deadline(row, now))
	}
	return items, nil
}
