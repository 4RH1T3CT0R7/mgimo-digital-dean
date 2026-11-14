-- name: InsertEventNotification :exec
INSERT INTO notifications (
    type, title, body, important, link_kind, link_id, link_date,
    audience_kind, audience_user_id, audience_faculty_id, audience_group_id,
    author_label, source_event_id, created_at
) VALUES (
    sqlc.arg(type), sqlc.arg(title), sqlc.arg(body), sqlc.arg(important),
    sqlc.arg(link_kind), sqlc.narg(link_id), sqlc.narg(link_date),
    sqlc.arg(audience_kind), sqlc.narg(audience_user_id), sqlc.narg(audience_faculty_id),
    sqlc.narg(audience_group_id), sqlc.narg(author_label), sqlc.arg(source_event_id), sqlc.arg(created_at)
)
ON CONFLICT (source_event_id, audience_group_id) WHERE source_event_id IS NOT NULL DO NOTHING;
