package app

import (
	"context"
	"errors"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/platform"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/notifications/internal/api"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/notifications/internal/db"
	"github.com/jackc/pgx/v5"
)

// internalPath — ссылка баннера на раздел кабинета: `/news`, `/requests/new/financial-aid`.
var internalPath = regexp.MustCompile(`^/[a-z0-9][a-z0-9/_-]*$`)

// validLink — только внутренний путь или https с хостом и без логина в адресе:
// так ссылка не станет javascript:, протокольно-относительной (//evil.com) или фишинговой (https://user@host).
func validLink(link string) bool {
	if internalPath.MatchString(link) {
		return true
	}
	u, err := url.Parse(link)
	return err == nil && u.Scheme == "https" && u.Host != "" && u.Hostname() != "" && u.User == nil
}

func banner(row db.Banner) api.Banner {
	return api.Banner{Id: row.ID, Title: row.Title, Body: row.Body, Priority: api.BannerPriority(row.Priority),
		LinkUrl: row.LinkUrl, LinkLabel: row.LinkLabel, StartsAt: row.StartsAt.In(moscow), EndsAt: row.EndsAt.In(moscow)}
}

func adminBanner(row db.Banner, dismissed int64, now time.Time) api.AdminBanner {
	b := banner(row)
	status := api.Active
	switch {
	case now.Before(row.StartsAt):
		status = api.Scheduled
	case !now.Before(row.EndsAt):
		status = api.Ended
	}
	return api.AdminBanner{Id: b.Id, Title: b.Title, Body: b.Body, Priority: b.Priority, LinkUrl: b.LinkUrl,
		LinkLabel: b.LinkLabel, StartsAt: b.StartsAt, EndsAt: b.EndsAt, Status: status, DismissedCount: int(dismissed),
		CreatedAt: row.CreatedAt.In(moscow),
		Audience:  audience(row.AudienceKind, row.AudienceFacultyID, row.AudienceGroupID, row.AudienceCourse, nil)}
}

func (s *Server) GetMyBanners(ctx context.Context, _ api.GetMyBannersRequestObject) (api.GetMyBannersResponseObject, error) {
	m, err := s.membership(ctx)
	if err != nil {
		return nil, err
	}
	rows, err := s.q.ListMyBanners(ctx, db.ListMyBannersParams{
		StudentID: m.StudentId, FacultyID: m.FacultyId, Course: int32(m.Course), GroupIds: m.GroupIds, Now: s.now(),
	})
	if err != nil {
		return nil, err
	}
	out := make(api.GetMyBanners200JSONResponse, 0, len(rows))
	for _, row := range rows {
		out = append(out, banner(row))
	}
	return out, nil
}

func (s *Server) DismissBanner(ctx context.Context, req api.DismissBannerRequestObject) (api.DismissBannerResponseObject, error) {
	m, err := s.membership(ctx)
	if err != nil {
		return nil, err
	}
	priority, err := s.q.FindMyBanner(ctx, db.FindMyBannerParams{
		BannerID: req.BannerId, StudentID: m.StudentId, FacultyID: m.FacultyId, Course: int32(m.Course),
		GroupIds: m.GroupIds, Now: s.now(),
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, platform.NotFound()
	}
	if err != nil {
		return nil, err
	}
	if priority == string(api.Urgent) {
		return nil, platform.Conflict("conflict", "Срочное объявление скрыть нельзя")
	}
	if err := s.q.DismissBanner(ctx, db.DismissBannerParams{BannerID: req.BannerId, UserID: m.StudentId}); err != nil {
		return nil, err
	}
	return api.DismissBanner204Response{}, nil
}

func (s *Server) ListAdminBanners(ctx context.Context, _ api.ListAdminBannersRequestObject) (api.ListAdminBannersResponseObject, error) {
	if _, err := platform.RequireAdmin(ctx); err != nil {
		return nil, err
	}
	rows, err := s.q.ListAdminBanners(ctx)
	if err != nil {
		return nil, err
	}
	now := s.now()
	out := make(api.ListAdminBanners200JSONResponse, 0, len(rows))
	for _, row := range rows {
		out = append(out, adminBanner(row.Banner, row.DismissedCount, now))
	}
	return out, nil
}

// optional — обрезанный текст или nil, если поле пустое.
func optional(value *string) *string {
	if value == nil {
		return nil
	}
	if v := strings.TrimSpace(*value); v != "" {
		return &v
	}
	return nil
}

func (s *Server) CreateBanner(ctx context.Context, req api.CreateBannerRequestObject) (api.CreateBannerResponseObject, error) {
	id, err := platform.RequireAdmin(ctx)
	if err != nil {
		return nil, err
	}
	if req.Body == nil {
		return nil, platform.Validation(map[string]string{"body": "Укажите данные баннера"})
	}
	b := req.Body
	now := s.now()
	title, body, link, label := strings.TrimSpace(b.Title), optional(b.Body), optional(b.LinkUrl), optional(b.LinkLabel)
	fields := map[string]string{}
	if !validText(title, 3, 80) {
		fields["title"] = "Введите от 3 до 80 символов"
	}
	if body != nil && !validText(*body, 1, 200) {
		fields["body"] = "Не больше 200 символов"
	}
	if b.Priority != api.Normal && b.Priority != api.Urgent {
		fields["priority"] = "Выберите важность"
	}
	switch {
	case link != nil && (len(*link) > 500 || !validLink(*link)):
		fields["link_url"] = "Ссылка — адрес https:// или раздел кабинета, например /news"
	case link != nil && label == nil:
		fields["link_label"] = "Укажите подпись ссылки"
	case link == nil && label != nil:
		fields["link_url"] = "Укажите ссылку или уберите подпись"
	}
	if label != nil && !validText(*label, 1, 30) {
		fields["link_label"] = "Не больше 30 символов"
	}
	if !b.EndsAt.After(b.StartsAt) {
		fields["ends_at"] = "Окончание должно быть позже начала"
	} else if !b.EndsAt.After(now) {
		fields["ends_at"] = "Окончание должно быть в будущем"
	}
	if b.Audience.Kind == api.User {
		fields["audience"] = "Баннер нельзя адресовать одному студенту"
	}
	if len(fields) != 0 {
		return nil, platform.Validation(fields)
	}
	a, err := normalizeAudience(ctx, s.academic, id, b.Audience)
	if err != nil {
		return nil, err
	}
	row, err := s.q.InsertBanner(ctx, db.InsertBannerParams{
		Title: title, Body: body, Priority: string(b.Priority), LinkUrl: link, LinkLabel: label,
		AudienceKind: string(a.Kind), AudienceFacultyID: a.FacultyId, AudienceCourse: toCourse32(a.Course),
		AudienceGroupID: a.GroupId, StartsAt: b.StartsAt, EndsAt: b.EndsAt, AuthorID: id.UserID, CreatedAt: now,
	})
	if err != nil {
		return nil, err
	}
	logAdmin(ctx, id, "banner_created", row.ID)
	return api.CreateBanner201JSONResponse(adminBanner(row, 0, now)), nil
}

func (s *Server) EndBanner(ctx context.Context, req api.EndBannerRequestObject) (api.EndBannerResponseObject, error) {
	id, err := platform.RequireAdmin(ctx)
	if err != nil {
		return nil, err
	}
	n, err := s.q.EndBanner(ctx, db.EndBannerParams{Now: s.now(), BannerID: req.BannerId})
	if err != nil {
		return nil, err
	}
	if n == 0 {
		exists, err := s.q.BannerExists(ctx, req.BannerId)
		if err != nil {
			return nil, err
		}
		if exists {
			return nil, platform.Conflict("conflict", "Баннер уже снят")
		}
		return nil, platform.NotFound()
	}
	logAdmin(ctx, id, "banner_ended", req.BannerId)
	return api.EndBanner204Response{}, nil
}
