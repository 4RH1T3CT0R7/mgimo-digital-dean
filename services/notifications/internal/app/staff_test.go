package app

import (
	"context"
	"slices"
	"testing"
	"time"

	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/platform/platformtest"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/notifications/internal/api"
	"github.com/google/uuid"
)

const announcementsPath = "/staff/announcements"
const deadlinesPath = "/staff/deadlines"

func TestS1ForeignGroup(t *testing.T) {
	e := setup(t)
	body := publication(api.Audience{Kind: api.Group, GroupId: &g7})
	w := e.req("POST", announcementsPath, platformtest.Staff(uuid.New(), f1), body, 400)
	if platformtest.DecodeError(t, w.Body.Bytes()).Details.Fields["audience"] == "" {
		t.Fatal("нет ошибки поля audience")
	}
}

func TestS2StaffFaculty(t *testing.T) {
	e := setup(t)
	w := e.req("POST", announcementsPath, platformtest.Staff(uuid.New(), f1), publication(api.Audience{Kind: api.Faculty}), 201)
	got := decode[api.StaffAnnouncement](t, w)
	var stored uuid.UUID
	var label string
	err := e.s.pool.QueryRow(context.Background(), "SELECT audience_faculty_id, author_label FROM notifications WHERE id=$1", got.Id).Scan(&stored, &label)
	if err != nil || stored != f1 || got.Audience.FacultyId == nil || *got.Audience.FacultyId != f1 {
		t.Fatalf("факультет: ответ %+v, БД %v, ошибка %v", got.Audience, stored, err)
	}
	if label != "Деканат ФМО" {
		t.Fatalf("подпись %q", label)
	}
}

func TestS3All(t *testing.T) {
	e := setup(t)
	body := publication(api.Audience{Kind: api.All})
	e.req("POST", announcementsPath, platformtest.Staff(uuid.New(), f1), body, 400)
	e.req("POST", announcementsPath, platformtest.Admin(uuid.New()), body, 201)
}

func TestS4PublicationScope(t *testing.T) {
	e := setup(t)
	own := e.notification(api.Audience{Kind: api.Faculty, FacultyId: &f1}, "announcement", true, true, clock)
	other := e.notification(api.Audience{Kind: api.Faculty, FacultyId: &f2}, "news", false, false, clock.Add(time.Minute))
	all := e.notification(api.Audience{Kind: api.All}, "news", false, false, clock.Add(-time.Minute))
	e.mark(own, "ack", 204)
	e.notification(api.Audience{Kind: api.User, UserId: &s1}, "application_status", true, false, clock)
	staff := decode[api.StaffAnnouncementList](t, e.req("GET", announcementsPath, platformtest.Staff(uuid.New(), f1), nil, 200))
	if staff.Total != 1 || len(staff.Items) != 1 || staff.Items[0].Id != own {
		t.Fatalf("объявления сотрудника: %+v", staff)
	}
	item := staff.Items[0]
	if item.ReadCount == nil || *item.ReadCount != 1 || item.AckedCount == nil || *item.AckedCount != 1 {
		t.Fatalf("счётчики объявления: %+v", item)
	}
	admin := decode[api.StaffAnnouncementList](t, e.req("GET", announcementsPath, platformtest.Admin(uuid.New()), nil, 200))
	ids := make([]uuid.UUID, 0, len(admin.Items))
	for _, item := range admin.Items {
		ids = append(ids, item.Id)
	}
	if admin.Total != 3 || !slices.Equal(ids, []uuid.UUID{other, own, all}) {
		t.Fatalf("объявления администратора: %+v", admin)
	}
}

func TestS5AckReport(t *testing.T) {
	e := setup(t)
	own := e.notification(api.Audience{Kind: api.Group, GroupId: &g2, FacultyId: &f1}, "announcement", true, true, clock)
	e.mark(own, "ack", 204)
	path := announcementsPath + "/" + own.String() + "/acks"
	got := decode[api.AckReport](t, e.req("GET", path, platformtest.Staff(uuid.New(), f1), nil, 200))
	if got.Total != 3 || len(got.Acked) != 1 || got.Acked[0].Id != s1 ||
		got.Acked[0].AckedAt == nil || !got.Acked[0].AckedAt.Equal(clock) || !inMSK(*got.Acked[0].AckedAt) || len(got.NotAcked) != 2 {
		t.Fatalf("отчёт: %+v", got)
	}
	e.req("GET", path, platformtest.Staff(uuid.New(), f2), nil, 404)
}

func TestS6Deadline(t *testing.T) {
	e := setup(t)
	staff1, staff2 := platformtest.Staff(uuid.New(), f1), platformtest.Staff(uuid.New(), f2)
	body := api.CreateDeadlineRequest{Title: "Срок заявления", Kind: api.DeadlineKindApplication, DueAt: clock.Add(-time.Hour), Audience: api.Audience{Kind: api.Faculty}}
	w := e.req("POST", deadlinesPath, staff1, body, 400)
	if platformtest.DecodeError(t, w.Body.Bytes()).Details.Fields["due_at"] == "" {
		t.Fatal("нет ошибки поля due_at")
	}
	body.DueAt = clock.Add(2 * time.Hour)
	service := "financial-aid"
	body.ServiceTypeId = &service
	created := decode[api.StaffDeadline](t, e.req("POST", deadlinesPath, staff1, body, 201))
	path := deadlinesPath + "/" + created.Id.String()
	e.req("DELETE", path, staff2, nil, 404)
	for _, endpoint := range []string{announcementsPath, deadlinesPath} {
		e.req("GET", endpoint, platformtest.Student(s1), nil, 403)
	}
	items := decode[[]api.Deadline](t, e.req("GET", "/me/deadlines", platformtest.Student(s1), nil, 200))
	if len(items) != 1 || items[0].Id != created.Id || items[0].ServiceTypeId == nil || *items[0].ServiceTypeId != service {
		t.Fatalf("дедлайн студента: %+v", items)
	}
	other := decode[[]api.Deadline](t, e.req("GET", "/me/deadlines", platformtest.Student(s2), nil, 200))
	if len(other) != 0 {
		t.Fatalf("чужой дедлайн: %+v", other)
	}
	e.req("DELETE", path, staff1, nil, 204)
	e.req("DELETE", path, staff1, nil, 404)
}

func TestDeadlineInput(t *testing.T) {
	e := setup(t)
	staff := platformtest.Staff(uuid.New(), f1)
	blank, slug := "   ", "Financial aid"
	body := api.CreateDeadlineRequest{Title: "Срок заявления", Kind: api.DeadlineKindApplication, DueAt: clock.Add(time.Hour),
		Description: &blank, ServiceTypeId: &slug, Audience: api.Audience{Kind: api.Faculty}}
	w := e.req("POST", deadlinesPath, staff, body, 400)
	if platformtest.DecodeError(t, w.Body.Bytes()).Details.Fields["service_type_id"] == "" {
		t.Fatal("нет ошибки поля service_type_id")
	}
	body.ServiceTypeId = nil
	if got := decode[api.StaffDeadline](t, e.req("POST", deadlinesPath, staff, body, 201)); got.Description != nil {
		t.Fatalf("пустое описание сохранено: %q", *got.Description)
	}
}

func publication(a api.Audience) api.CreateAnnouncementRequest {
	return api.CreateAnnouncementRequest{Type: api.CreateAnnouncementRequestTypeAnnouncement,
		Title: "Сообщение деканата", Body: "Прочитайте условия.", Important: true, RequiresAck: true, Audience: a}
}
