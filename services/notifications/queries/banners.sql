-- name: ListMyBanners :many
-- Адресованные студенту и действующие сейчас, без скрытых им обычных; срочные первыми.
SELECT b.* FROM banners b
WHERE notification_matches(b.audience_kind, NULL, b.audience_faculty_id, b.audience_course, b.audience_group_id,
          sqlc.arg(student_id)::uuid, sqlc.arg(faculty_id)::uuid, sqlc.arg(course)::integer, sqlc.arg(group_ids)::uuid[])
  AND b.starts_at <= sqlc.arg(now)::timestamptz AND b.ends_at > sqlc.arg(now)::timestamptz
  AND (b.priority = 'urgent' OR NOT EXISTS (
      SELECT 1 FROM banner_dismissals d WHERE d.banner_id = b.id AND d.user_id = sqlc.arg(student_id)::uuid))
ORDER BY (b.priority = 'urgent') DESC, b.starts_at DESC, b.created_at DESC, b.id
LIMIT 3;

-- name: FindMyBanner :one
SELECT b.priority FROM banners b
WHERE b.id = sqlc.arg(banner_id)::uuid
  AND notification_matches(b.audience_kind, NULL, b.audience_faculty_id, b.audience_course, b.audience_group_id,
          sqlc.arg(student_id)::uuid, sqlc.arg(faculty_id)::uuid, sqlc.arg(course)::integer, sqlc.arg(group_ids)::uuid[])
  AND b.starts_at <= sqlc.arg(now)::timestamptz AND b.ends_at > sqlc.arg(now)::timestamptz;

-- name: DismissBanner :exec
INSERT INTO banner_dismissals (banner_id, user_id) VALUES (sqlc.arg(banner_id), sqlc.arg(user_id))
ON CONFLICT DO NOTHING;

-- name: ListAdminBanners :many
SELECT sqlc.embed(b), (SELECT count(*) FROM banner_dismissals d WHERE d.banner_id = b.id) AS dismissed_count
FROM banners b
ORDER BY b.created_at DESC, b.id DESC;

-- name: InsertBanner :one
INSERT INTO banners (title, body, priority, link_url, link_label, audience_kind, audience_faculty_id,
    audience_course, audience_group_id, starts_at, ends_at, author_id, created_at)
VALUES (sqlc.arg(title), sqlc.narg(body), sqlc.arg(priority), sqlc.narg(link_url), sqlc.narg(link_label),
    sqlc.arg(audience_kind), sqlc.narg(audience_faculty_id), sqlc.narg(audience_course), sqlc.narg(audience_group_id),
    sqlc.arg(starts_at), sqlc.arg(ends_at), sqlc.arg(author_id), sqlc.arg(created_at))
RETURNING *;

-- name: EndBanner :execrows
UPDATE banners SET ends_at = sqlc.arg(now)::timestamptz, starts_at = LEAST(starts_at, sqlc.arg(now)::timestamptz)
WHERE id = sqlc.arg(banner_id)::uuid AND ends_at > sqlc.arg(now)::timestamptz;

-- name: BannerExists :one
SELECT EXISTS (SELECT 1 FROM banners WHERE id = sqlc.arg(banner_id)::uuid);
