-- name: ListStaffAnnouncements :many
SELECT sqlc.embed(n),
       (SELECT count(*) FROM notification_reads r WHERE r.notification_id = n.id) AS read_count,
       (SELECT count(*) FROM notification_reads r WHERE r.notification_id = n.id AND r.acked_at IS NOT NULL) AS acked_count,
       (SELECT count(*) FROM notification_reads r WHERE r.notification_id = n.id AND r.going_at IS NOT NULL) AS going_count
FROM notifications n
WHERE n.author_id IS NOT NULL AND n.type IN ('news', 'announcement')
  AND (sqlc.narg(scope)::uuid IS NULL OR n.audience_faculty_id = sqlc.narg(scope)::uuid)
ORDER BY n.created_at DESC, n.id DESC
LIMIT sqlc.arg(page_limit)::integer OFFSET sqlc.arg(page_offset)::integer;

-- name: CountStaffAnnouncements :one
SELECT count(*) FROM notifications
WHERE author_id IS NOT NULL AND type IN ('news', 'announcement')
  AND (sqlc.narg(scope)::uuid IS NULL OR audience_faculty_id = sqlc.narg(scope)::uuid);

-- name: InsertAnnouncement :one
INSERT INTO notifications (type, title, body, important, requires_ack, audience_kind,
    audience_faculty_id, audience_course, audience_group_id, author_id, author_label, created_at,
    event_starts_at, event_place)
VALUES (sqlc.arg(type), sqlc.arg(title), sqlc.arg(body), sqlc.arg(important), sqlc.arg(requires_ack),
    sqlc.arg(audience_kind), sqlc.narg(audience_faculty_id), sqlc.narg(audience_course),
    sqlc.narg(audience_group_id), sqlc.arg(author_id), sqlc.arg(author_label), sqlc.arg(created_at),
    sqlc.narg(event_starts_at), sqlc.narg(event_place))
RETURNING *;

-- name: FindStaffAnnouncement :one
SELECT * FROM notifications
WHERE id = sqlc.arg(item_id)::uuid AND author_id IS NOT NULL AND type IN ('news', 'announcement')
  AND (sqlc.narg(scope)::uuid IS NULL OR audience_faculty_id = sqlc.narg(scope)::uuid);

-- name: ListAcknowledgedStudents :many
SELECT r.user_id, r.acked_at
FROM notification_reads r
JOIN notifications n ON n.id = r.notification_id
WHERE n.id = sqlc.arg(item_id)::uuid AND r.acked_at IS NOT NULL
  AND r.user_id = ANY(sqlc.arg(student_ids)::uuid[])
  AND (sqlc.narg(scope)::uuid IS NULL OR n.audience_faculty_id = sqlc.narg(scope)::uuid);

-- name: ListStaffDeadlines :many
SELECT * FROM deadlines WHERE sqlc.narg(scope)::uuid IS NULL OR audience_faculty_id = sqlc.narg(scope)::uuid
ORDER BY due_at, id;

-- name: InsertDeadline :one
INSERT INTO deadlines (title, description, kind, due_at, service_type_id, audience_kind,
    audience_faculty_id, audience_course, audience_group_id, author_id, created_at)
VALUES (sqlc.arg(title), sqlc.narg(description), sqlc.arg(kind), sqlc.arg(due_at), sqlc.narg(service_type_id),
    sqlc.arg(audience_kind), sqlc.narg(audience_faculty_id), sqlc.narg(audience_course),
    sqlc.narg(audience_group_id), sqlc.arg(author_id), sqlc.arg(created_at))
RETURNING *;

-- name: DeleteStaffDeadline :execrows
DELETE FROM deadlines WHERE id = sqlc.arg(item_id)::uuid
  AND (sqlc.narg(scope)::uuid IS NULL OR audience_faculty_id = sqlc.narg(scope)::uuid);
