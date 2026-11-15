package app

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/clients/academic"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/platform"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/notifications/internal/api"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/notifications/internal/db"
	"github.com/jackc/pgx/v5/pgxpool"
)

var moscow = time.FixedZone("Europe/Moscow", 3*60*60)

type Server struct {
	pool     *pgxpool.Pool
	q        *db.Queries
	log      *slog.Logger
	now      func() time.Time
	academic *academic.ClientWithResponses
}

var _ api.StrictServerInterface = (*Server)(nil)

func New(pool *pgxpool.Pool, log *slog.Logger, now func() time.Time, academicClient *academic.ClientWithResponses) *Server {
	return &Server{pool: pool, q: db.New(pool), log: log, now: now, academic: academicClient}
}

func (s *Server) Handlers() (http.Handler, http.Handler) {
	strict := api.StrictHTTPServerOptions{
		RequestErrorHandlerFunc:  platform.RequestErrorHandler,
		ResponseErrorHandlerFunc: platform.ResponseErrorHandler,
	}
	pub := api.HandlerWithOptions(api.NewStrictHandlerWithOptions(s, nil, strict), api.StdHTTPServerOptions{
		BaseRouter: platform.NewMux(), ErrorHandlerFunc: platform.RequestErrorHandler,
	})
	return platform.Middleware(s.log, pub), platform.Middleware(s.log, platform.NewMux())
}

func (s *Server) membership(ctx context.Context) (academic.Membership, error) {
	id, err := platform.RequireStudent(ctx)
	if err != nil {
		return academic.Membership{}, err
	}
	r, err := s.academic.GetStudentMembershipWithResponse(ctx, id.UserID)
	if err != nil {
		return academic.Membership{}, fmt.Errorf("academic getStudentMembership: %w", err)
	}
	if r.StatusCode() == http.StatusNotFound {
		return academic.Membership{}, platform.NotFound()
	}
	if r.JSON200 == nil || r.JSON200.StudentId != id.UserID {
		return academic.Membership{}, fmt.Errorf("academic getStudentMembership: неверный ответ, статус %d", r.StatusCode())
	}
	return *r.JSON200, nil
}

func inMoscow(t *time.Time) *time.Time {
	if t == nil {
		return nil
	}
	m := t.In(moscow)
	return &m
}

func pagination(limit, offset *int) (int32, int32, error) {
	l, o := 20, 0
	if limit != nil {
		l = *limit
	}
	if offset != nil {
		o = *offset
	}
	fields := map[string]string{}
	if l < 1 || l > 100 {
		fields["limit"] = "Укажите число от 1 до 100"
	}
	if o < 0 || o > 1<<31-1 {
		fields["offset"] = "Укажите допустимое смещение"
	}
	if len(fields) != 0 {
		return 0, 0, platform.Validation(fields)
	}
	return int32(l), int32(o), nil
}

func daysLeft(now, due time.Time) int {
	date := func(t time.Time) time.Time {
		y, m, d := t.In(moscow).Date()
		return time.Date(y, m, d, 0, 0, 0, 0, moscow)
	}
	return int(date(due).Sub(date(now)) / (24 * time.Hour))
}
