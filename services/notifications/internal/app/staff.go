package app

import (
	"context"

	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/platform"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/notifications/internal/api"
)

// Заглушки маршрутов PR2: интерфейс из общего контракта реализуется целиком.
func pendingStaff(ctx context.Context) error {
	if _, err := platform.RequireStaffOrAdmin(ctx); err != nil {
		return err
	}
	return platform.NotFound()
}

func (s *Server) ListStaffAnnouncements(ctx context.Context, _ api.ListStaffAnnouncementsRequestObject) (api.ListStaffAnnouncementsResponseObject, error) {
	return nil, pendingStaff(ctx)
}
func (s *Server) CreateAnnouncement(ctx context.Context, _ api.CreateAnnouncementRequestObject) (api.CreateAnnouncementResponseObject, error) {
	return nil, pendingStaff(ctx)
}
func (s *Server) GetAnnouncementAcks(ctx context.Context, _ api.GetAnnouncementAcksRequestObject) (api.GetAnnouncementAcksResponseObject, error) {
	return nil, pendingStaff(ctx)
}
func (s *Server) ListStaffDeadlines(ctx context.Context, _ api.ListStaffDeadlinesRequestObject) (api.ListStaffDeadlinesResponseObject, error) {
	return nil, pendingStaff(ctx)
}
func (s *Server) CreateDeadline(ctx context.Context, _ api.CreateDeadlineRequestObject) (api.CreateDeadlineResponseObject, error) {
	return nil, pendingStaff(ctx)
}
func (s *Server) DeleteDeadline(ctx context.Context, _ api.DeleteDeadlineRequestObject) (api.DeleteDeadlineResponseObject, error) {
	return nil, pendingStaff(ctx)
}
