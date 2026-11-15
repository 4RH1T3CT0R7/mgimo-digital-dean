-- name: ListFeed :many
SELECT sqlc.embed(n), r.read_at, r.acked_at
FROM notifications n
LEFT JOIN notification_reads r ON r.notification_id = n.id AND r.user_id = sqlc.arg(student_id)::uuid
WHERE notification_matches(audience_kind, audience_user_id, audience_faculty_id, audience_course, audience_group_id,
          sqlc.arg(student_id)::uuid, sqlc.arg(faculty_id)::uuid, sqlc.arg(course)::integer, sqlc.arg(group_ids)::uuid[])
  AND (NOT sqlc.arg(unread_only)::boolean OR r.read_at IS NULL)
  AND (cardinality(sqlc.arg(types)::text[]) = 0 OR n.type = ANY(sqlc.arg(types)::text[]))
  AND n.created_at <= sqlc.arg(now)::timestamptz
ORDER BY (n.important AND r.read_at IS NULL) DESC, n.created_at DESC, n.id DESC
LIMIT sqlc.arg(page_limit)::integer OFFSET sqlc.arg(page_offset)::integer;

-- name: CountFeed :one
SELECT count(*)
FROM notifications n
LEFT JOIN notification_reads r ON r.notification_id = n.id AND r.user_id = sqlc.arg(student_id)::uuid
WHERE notification_matches(audience_kind, audience_user_id, audience_faculty_id, audience_course, audience_group_id,
          sqlc.arg(student_id)::uuid, sqlc.arg(faculty_id)::uuid, sqlc.arg(course)::integer, sqlc.arg(group_ids)::uuid[])
  AND (NOT sqlc.arg(unread_only)::boolean OR r.read_at IS NULL)
  AND (cardinality(sqlc.arg(types)::text[]) = 0 OR n.type = ANY(sqlc.arg(types)::text[]))
  AND n.created_at <= sqlc.arg(now)::timestamptz;

-- name: FeedCounters :one
SELECT count(*) FILTER (WHERE r.read_at IS NULL) AS unread,
       count(*) FILTER (WHERE n.requires_ack AND r.acked_at IS NULL) AS important_unacked
FROM notifications n
LEFT JOIN notification_reads r ON r.notification_id = n.id AND r.user_id = sqlc.arg(student_id)::uuid
WHERE notification_matches(audience_kind, audience_user_id, audience_faculty_id, audience_course, audience_group_id,
          sqlc.arg(student_id)::uuid, sqlc.arg(faculty_id)::uuid, sqlc.arg(course)::integer, sqlc.arg(group_ids)::uuid[])
  AND n.created_at <= sqlc.arg(now)::timestamptz;

-- name: FindVisibleNotification :one
SELECT n.requires_ack
FROM notifications n
WHERE n.id = sqlc.arg(item_id)::uuid AND notification_matches(audience_kind, audience_user_id, audience_faculty_id, audience_course, audience_group_id,
          sqlc.arg(student_id)::uuid, sqlc.arg(faculty_id)::uuid, sqlc.arg(course)::integer, sqlc.arg(group_ids)::uuid[])
  AND n.created_at <= sqlc.arg(now)::timestamptz;

-- name: MarkRead :execrows
INSERT INTO notification_reads (notification_id, user_id, read_at, acked_at)
SELECT n.id, sqlc.arg(student_id)::uuid, sqlc.arg(marked_at)::timestamptz,
       CASE WHEN sqlc.arg(ack)::boolean THEN sqlc.arg(marked_at)::timestamptz END
FROM notifications n
WHERE n.id = sqlc.arg(item_id)::uuid AND notification_matches(audience_kind, audience_user_id, audience_faculty_id, audience_course, audience_group_id,
          sqlc.arg(student_id)::uuid, sqlc.arg(faculty_id)::uuid, sqlc.arg(course)::integer, sqlc.arg(group_ids)::uuid[])
  AND (NOT sqlc.arg(ack)::boolean OR n.requires_ack)
  AND n.created_at <= sqlc.arg(marked_at)::timestamptz
ON CONFLICT (notification_id, user_id) DO UPDATE
SET acked_at = COALESCE(notification_reads.acked_at, excluded.acked_at);

-- name: MarkAllRead :exec
INSERT INTO notification_reads (notification_id, user_id, read_at)
SELECT n.id, sqlc.arg(student_id)::uuid, sqlc.arg(marked_at)::timestamptz
FROM notifications n
WHERE notification_matches(audience_kind, audience_user_id, audience_faculty_id, audience_course, audience_group_id,
          sqlc.arg(student_id)::uuid, sqlc.arg(faculty_id)::uuid, sqlc.arg(course)::integer, sqlc.arg(group_ids)::uuid[])
  AND n.created_at <= sqlc.arg(marked_at)::timestamptz
ON CONFLICT (notification_id, user_id) DO NOTHING;

-- name: ListMyDeadlines :many
SELECT * FROM deadlines
WHERE due_at BETWEEN sqlc.arg(from_at)::timestamptz AND sqlc.arg(to_at)::timestamptz
  AND notification_matches(audience_kind, audience_user_id, audience_faculty_id, audience_course, audience_group_id,
          sqlc.arg(student_id)::uuid, sqlc.arg(faculty_id)::uuid, sqlc.arg(course)::integer, sqlc.arg(group_ids)::uuid[])
ORDER BY due_at, id;

-- name: CountMyDeadlines :one
SELECT count(*) FROM deadlines
WHERE due_at BETWEEN sqlc.arg(from_at)::timestamptz AND sqlc.arg(to_at)::timestamptz
  AND notification_matches(audience_kind, audience_user_id, audience_faculty_id, audience_course, audience_group_id,
          sqlc.arg(student_id)::uuid, sqlc.arg(faculty_id)::uuid, sqlc.arg(course)::integer, sqlc.arg(group_ids)::uuid[]);
