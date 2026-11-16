package app

import (
	"context"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/platform"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/platform/platformtest"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/notifications/internal/api"
	"github.com/google/uuid"
)

const bannersPath = "/admin/banners"

func bannerRequest(a api.Audience, priority api.BannerPriority) api.CreateBannerRequest {
	return api.CreateBannerRequest{Title: "Плановые работы", Priority: priority, Audience: a,
		StartsAt: clock.Add(-time.Hour), EndsAt: clock.Add(24 * time.Hour)}
}

func (e *env) banner(body api.CreateBannerRequest) uuid.UUID {
	e.t.Helper()
	return decode[api.AdminBanner](e.t, e.req("POST", bannersPath, platformtest.Admin(uuid.New()), body, 201)).Id
}

func (e *env) myBanners(student uuid.UUID) []uuid.UUID {
	e.t.Helper()
	items := decode[[]api.Banner](e.t, e.req("GET", "/me/banners", platformtest.Student(student), nil, 200))
	out := make([]uuid.UUID, 0, len(items))
	for _, item := range items {
		out = append(out, item.Id)
	}
	return out
}

// /admin/* — только администратор: студент и сотрудник получают 403.
func TestAdminRoutesByRole(t *testing.T) {
	e := setup(t)
	id := e.banner(bannerRequest(api.Audience{Kind: api.All}, api.Normal))
	body := bannerRequest(api.Audience{Kind: api.All}, api.Normal)
	for _, tc := range []struct {
		name string
		who  platform.Identity
		want [3]int
	}{
		{"студент", platformtest.Student(s1), [3]int{403, 403, 403}},
		{"сотрудник", platformtest.Staff(uuid.New(), f1), [3]int{403, 403, 403}},
		{"администратор", platformtest.Admin(uuid.New()), [3]int{200, 201, 204}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			e.t = t
			e.req("GET", bannersPath, tc.who, nil, tc.want[0])
			e.req("POST", bannersPath, tc.who, body, tc.want[1])
			e.req("POST", bannersPath+"/"+id.String()+"/end", tc.who, nil, tc.want[2])
		})
	}
}

func TestBannerLinkValidation(t *testing.T) {
	e := setup(t)
	admin := platformtest.Admin(uuid.New())
	label := "Подробнее"
	for _, link := range []string{"javascript:alert(1)", "http://example.com", "//evil.com", "https://u@h", "https://", "/News", "/../x", "data:text/html,1"} {
		body := bannerRequest(api.Audience{Kind: api.All}, api.Normal)
		body.LinkUrl, body.LinkLabel = &link, &label
		w := e.req("POST", bannersPath, admin, body, 400)
		if platformtest.DecodeError(t, w.Body.Bytes()).Details.Fields["link_url"] == "" {
			t.Fatalf("%s: нет ошибки поля link_url", link)
		}
	}
	for _, link := range []string{"https://mgimo.ru/study/schedule/", "/news", "/requests/new/financial-aid"} {
		body := bannerRequest(api.Audience{Kind: api.All}, api.Normal)
		body.LinkUrl, body.LinkLabel = &link, &label
		got := decode[api.AdminBanner](t, e.req("POST", bannersPath, admin, body, 201))
		if got.LinkUrl == nil || *got.LinkUrl != link {
			t.Fatalf("ссылка %q не сохранилась: %+v", link, got)
		}
	}
	// Ссылка без подписи, длинный заголовок, срок в прошлом и один студент — тоже 400.
	link := "/news"
	noLabel := bannerRequest(api.Audience{Kind: api.All}, api.Normal)
	noLabel.LinkUrl = &link
	e.req("POST", bannersPath, admin, noLabel, 400)
	long := bannerRequest(api.Audience{Kind: api.All}, api.Normal)
	long.Title = strings.Repeat("я", 81)
	e.req("POST", bannersPath, admin, long, 400)
	past := bannerRequest(api.Audience{Kind: api.All}, api.Normal)
	past.StartsAt, past.EndsAt = clock.Add(-2*time.Hour), clock.Add(-time.Hour)
	e.req("POST", bannersPath, admin, past, 400)
	e.req("POST", bannersPath, admin, bannerRequest(api.Audience{Kind: api.User, UserId: &s1}, api.Normal), 400)
}

func TestMyBanners(t *testing.T) {
	e := setup(t)
	course := 2
	normal := e.banner(bannerRequest(api.Audience{Kind: api.Faculty, FacultyId: &f1}, api.Normal))
	e.now = clock.Add(time.Minute)
	urgent := e.banner(bannerRequest(api.Audience{Kind: api.Course, FacultyId: &f1, Course: &course}, api.Urgent))
	e.now = clock.Add(2 * time.Minute)
	group := e.banner(bannerRequest(api.Audience{Kind: api.Group, GroupId: &g2}, api.Normal))
	foreign := e.banner(bannerRequest(api.Audience{Kind: api.Group, GroupId: &g7}, api.Normal))
	later := bannerRequest(api.Audience{Kind: api.All}, api.Normal)
	later.StartsAt = clock.Add(time.Hour)
	scheduled := e.banner(later)

	// Срочный первым, затем новые сверху; чужой и запланированный не видны.
	if got := e.myBanners(s1); !slices.Equal(got, []uuid.UUID{urgent, group, normal}) {
		t.Fatalf("баннеры студента: %v", got)
	}
	if got := e.myBanners(s2); !slices.Equal(got, []uuid.UUID{foreign}) {
		t.Fatalf("баннеры студента МЭО: %v", got)
	}
	// Больше трёх не отдаём.
	e.now = clock.Add(2 * time.Hour)
	if got := e.myBanners(s1); len(got) != 3 || got[0] != urgent || slices.Contains(got, normal) {
		t.Fatalf("не больше трёх: %v (запланированный %v)", got, scheduled)
	}

	dismiss := func(id uuid.UUID, student uuid.UUID, status int) {
		e.req("POST", "/me/banners/"+id.String()+"/dismiss", platformtest.Student(student), nil, status)
	}
	dismiss(foreign, s1, 404)
	dismiss(uuid.New(), s1, 404)
	w := e.req("POST", "/me/banners/"+urgent.String()+"/dismiss", platformtest.Student(s1), nil, 409)
	if code := platformtest.DecodeError(t, w.Body.Bytes()).Code; code != "conflict" {
		t.Fatalf("код ошибки %q", code)
	}
	dismiss(group, s1, 204)
	dismiss(group, s1, 204)
	if got := e.myBanners(s1); slices.Contains(got, group) || !slices.Contains(got, urgent) {
		t.Fatalf("после скрытия: %v", got)
	}
	admin := decode[[]api.AdminBanner](t, e.req("GET", bannersPath, platformtest.Admin(uuid.New()), nil, 200))
	for _, item := range admin {
		if item.Id == group && item.DismissedCount != 1 {
			t.Fatalf("закрывших: %+v", item)
		}
	}
}

func TestEndBanner(t *testing.T) {
	e := setup(t)
	admin := platformtest.Admin(uuid.New())
	active := e.banner(bannerRequest(api.Audience{Kind: api.All}, api.Urgent))
	later := bannerRequest(api.Audience{Kind: api.All}, api.Normal)
	later.StartsAt = clock.Add(time.Hour)
	scheduled := e.banner(later)
	status := func() map[uuid.UUID]api.BannerStatus {
		out := map[uuid.UUID]api.BannerStatus{}
		for _, item := range decode[[]api.AdminBanner](t, e.req("GET", bannersPath, admin, nil, 200)) {
			out[item.Id] = item.Status
		}
		return out
	}
	if got := status(); got[active] != api.Active || got[scheduled] != api.Scheduled {
		t.Fatalf("статусы до снятия: %v", got)
	}
	e.req("POST", bannersPath+"/"+active.String()+"/end", admin, nil, 204)
	e.req("POST", bannersPath+"/"+scheduled.String()+"/end", admin, nil, 204)
	e.req("POST", bannersPath+"/"+active.String()+"/end", admin, nil, 409)
	e.req("POST", bannersPath+"/"+uuid.New().String()+"/end", admin, nil, 404)
	if got := status(); got[active] != api.Ended || got[scheduled] != api.Ended {
		t.Fatalf("статусы после снятия: %v", got)
	}
	if got := e.myBanners(s1); len(got) != 0 {
		t.Fatalf("снятый баннер виден: %v", got)
	}
	e.now = clock.Add(2 * time.Hour)
	if got := e.myBanners(s1); len(got) != 0 {
		t.Fatalf("снятый до начала баннер появился: %v", got)
	}
}

func (e *env) event(a api.Audience, startsAt time.Time) uuid.UUID {
	e.t.Helper()
	id := e.notification(a, "news", false, false, clock.Add(-time.Hour))
	if _, err := e.s.pool.Exec(context.Background(), "UPDATE notifications SET event_starts_at=$2, event_place='Актовый зал' WHERE id=$1",
		id, startsAt); err != nil {
		e.t.Fatal(err)
	}
	return id
}

func TestGoing(t *testing.T) {
	e := setup(t)
	all := api.Audience{Kind: api.All}
	upcoming := e.event(all, clock.Add(48*time.Hour))
	past := e.event(all, clock.Add(-time.Minute))
	foreign := e.event(api.Audience{Kind: api.Faculty, FacultyId: &f2}, clock.Add(48*time.Hour))
	news := e.notification(all, "news", false, false, clock)
	announcement := e.notification(all, "announcement", false, false, clock)
	going := func(id uuid.UUID, method string, status int) {
		e.req(method, "/me/feed/"+id.String()+"/going", platformtest.Student(s1), nil, status)
	}
	going(upcoming, "POST", 204)
	going(upcoming, "POST", 204)
	going(past, "POST", 409)
	going(past, "DELETE", 409)
	going(news, "POST", 409)
	going(announcement, "POST", 409)
	going(foreign, "POST", 404)
	going(uuid.New(), "POST", 404)

	event := func() *api.FeedEvent {
		for _, item := range e.feed("?type=news").Items {
			if item.Id == upcoming {
				return item.Event
			}
		}
		t.Fatal("мероприятия нет в новостях")
		return nil
	}
	if ev := event(); ev == nil || !ev.Going || ev.GoingCount != 1 || ev.Place != "Актовый зал" || !inMSK(ev.StartsAt) {
		t.Fatalf("после «Пойду»: %+v", ev)
	}
	going(upcoming, "DELETE", 204)
	if ev := event(); ev.Going || ev.GoingCount != 0 {
		t.Fatalf("после отмены: %+v", ev)
	}
	for _, item := range e.feed("?type=news").Items {
		if item.Id == news && item.Event != nil {
			t.Fatalf("у обычной новости есть event: %+v", item)
		}
	}
}

// Новости живут в «Новостях и мероприятиях»: в ленте уведомлений, счётчике и «прочитать всё» их нет.
func TestNewsOutsideNotifications(t *testing.T) {
	e := setup(t)
	all := api.Audience{Kind: api.All}
	news := e.notification(all, "news", true, false, clock)
	event := e.event(all, clock.Add(24*time.Hour))
	announcement := e.notification(all, "announcement", false, false, clock)
	if got := e.feed(""); got.Total != 1 || !slices.Equal(ids(got.Items), []uuid.UUID{announcement}) {
		t.Fatalf("лента уведомлений: %+v", got)
	}
	if got := e.feed("?unread_only=true"); got.Total != 1 {
		t.Fatalf("непрочитанные уведомления: %+v", got)
	}
	if c := e.counters(); c.Unread != 1 {
		t.Fatalf("счётчик: %+v", c)
	}
	if got := ids(e.feed("?type=news").Items); !slices.Contains(got, news) || !slices.Contains(got, event) || len(got) != 2 {
		t.Fatalf("новости: %v", got)
	}
	e.req("POST", "/me/feed/read-all", platformtest.Student(s1), nil, 204)
	for _, item := range e.feed("?type=news").Items {
		if item.ReadAt != nil {
			t.Fatalf("«прочитать всё» отметило новость: %+v", item)
		}
	}
	if c := e.counters(); c.Unread != 0 {
		t.Fatalf("счётчик после «прочитать всё»: %+v", c)
	}
}

func TestCreateEvent(t *testing.T) {
	e := setup(t)
	staff := platformtest.Staff(uuid.New(), f1)
	place, starts, past := "Актовый зал", clock.Add(72*time.Hour), clock.Add(-time.Hour)
	body := api.CreateAnnouncementRequest{Type: api.CreateAnnouncementRequestTypeNews, Title: "Открытая лекция",
		Body: "Приходите.", Audience: api.Audience{Kind: api.Faculty}, EventStartsAt: &starts, EventPlace: &place}
	for _, tc := range []struct {
		field  string
		change func(*api.CreateAnnouncementRequest)
	}{
		{"event_starts_at", func(b *api.CreateAnnouncementRequest) { b.Type = api.CreateAnnouncementRequestTypeAnnouncement }},
		{"event_starts_at", func(b *api.CreateAnnouncementRequest) { b.EventStartsAt = nil }},
		{"event_place", func(b *api.CreateAnnouncementRequest) { b.EventPlace = nil }},
		{"event_starts_at", func(b *api.CreateAnnouncementRequest) { b.EventStartsAt = &past }},
	} {
		bad := body
		tc.change(&bad)
		w := e.req("POST", announcementsPath, staff, bad, 400)
		if platformtest.DecodeError(t, w.Body.Bytes()).Details.Fields[tc.field] == "" {
			t.Fatalf("нет ошибки поля %s: %s", tc.field, w.Body)
		}
	}
	created := decode[api.StaffAnnouncement](t, e.req("POST", announcementsPath, staff, body, 201))
	if created.EventStartsAt == nil || !created.EventStartsAt.Equal(starts) || created.EventPlace == nil ||
		*created.EventPlace != place || created.GoingCount == nil || *created.GoingCount != 0 {
		t.Fatalf("мероприятие: %+v", created)
	}
	e.req("POST", "/me/feed/"+created.Id.String()+"/going", platformtest.Student(s1), nil, 204)
	list := decode[api.StaffAnnouncementList](t, e.req("GET", announcementsPath, staff, nil, 200))
	if len(list.Items) != 1 || list.Items[0].GoingCount == nil || *list.Items[0].GoingCount != 1 {
		t.Fatalf("сколько идёт: %+v", list.Items)
	}
}
