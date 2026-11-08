-- ---------- Каталог ----------

-- name: ListActiveServiceTypes :many
SELECT * FROM service_types WHERE active ORDER BY sort_order, id;

-- Все, включая неактивные: для показа уже поданных заявок.
-- name: ListAllServiceTypes :many
SELECT * FROM service_types;

-- name: GetServiceType :one
SELECT * FROM service_types WHERE id = sqlc.arg(id);

-- ---------- Заявки: создание и смена состояния ----------

-- name: CreateApplication :one
INSERT INTO applications (id, student_id, faculty_id, service_type_id, status, fields, comment,
                          student_snapshot, created_at, updated_at, due_at)
VALUES (sqlc.arg(id), sqlc.arg(student_id), sqlc.arg(faculty_id), sqlc.arg(service_type_id), sqlc.arg(status),
        sqlc.arg(fields), sqlc.narg(comment), sqlc.arg(student_snapshot), sqlc.arg(now), sqlc.arg(now), sqlc.narg(due_at))
RETURNING *;

-- Смена статуса только из ожидаемого: параллельная смена даст 0 строк → 409.
-- У конечных статусов срок готовности сбрасывается (Б5).
-- name: UpdateStatus :execrows
UPDATE applications
SET status = sqlc.arg(new_status),
    updated_at = sqlc.arg(now),
    due_at = CASE WHEN sqlc.arg(terminal)::boolean THEN NULL ELSE due_at END
WHERE id = sqlc.arg(id) AND status = sqlc.arg(old_status);

-- name: InsertStatusHistory :exec
INSERT INTO status_history (application_id, status, comment, actor_role, actor_id, created_at)
VALUES (sqlc.arg(application_id), sqlc.arg(status), sqlc.narg(comment), sqlc.arg(actor_role), sqlc.narg(actor_id), sqlc.arg(now));

-- name: TouchLastMessage :exec
UPDATE applications
SET last_message_at = sqlc.arg(now), last_message_from = sqlc.arg(author_role), updated_at = sqlc.arg(now)
WHERE id = sqlc.arg(id);

-- name: TouchApplication :exec
UPDATE applications SET updated_at = sqlc.arg(now) WHERE id = sqlc.arg(id);

-- ---------- Заявки: чтение с правами ----------
-- Студент — только свои (student_id из сессии); сотрудник — свой факультет, admin — все (faculty_id = NULL).

-- name: GetStudentApplication :one
SELECT * FROM applications WHERE id = sqlc.arg(id) AND student_id = sqlc.arg(student_id);

-- name: GetScopedApplication :one
SELECT * FROM applications
WHERE id = sqlc.arg(id) AND (sqlc.narg(faculty_id)::uuid IS NULL OR faculty_id = sqlc.narg(faculty_id));

-- «Ответ пришёл»: статус ready/needs_info/rejected или последнее сообщение от деканата.
-- name: ListStudentApplications :many
SELECT * FROM applications
WHERE student_id = sqlc.arg(student_id)
  AND (cardinality(sqlc.arg(statuses)::text[]) = 0 OR status = ANY (sqlc.arg(statuses)::text[]))
  AND (sqlc.narg(answered)::boolean IS NULL OR
       (status IN ('ready', 'needs_info', 'rejected') OR last_message_from IS NOT DISTINCT FROM 'staff') = sqlc.narg(answered)::boolean)
ORDER BY updated_at DESC, id
LIMIT sqlc.arg(lim) OFFSET sqlc.arg(off);

-- name: CountStudentApplications :one
SELECT count(*) FROM applications
WHERE student_id = sqlc.arg(student_id)
  AND (cardinality(sqlc.arg(statuses)::text[]) = 0 OR status = ANY (sqlc.arg(statuses)::text[]))
  AND (sqlc.narg(answered)::boolean IS NULL OR
       (status IN ('ready', 'needs_info', 'rejected') OR last_message_from IS NOT DISTINCT FROM 'staff') = sqlc.narg(answered)::boolean);

-- Поиск q: по номеру (как его видит человек, с ведущими нулями) или ФИО из слепка.
-- Сначала просроченные, затем по сроку, затем по дате подачи.
-- name: ListStaffApplications :many
SELECT * FROM applications
WHERE (sqlc.narg(faculty_id)::uuid IS NULL OR faculty_id = sqlc.narg(faculty_id))
  AND (cardinality(sqlc.arg(statuses)::text[]) = 0 OR status = ANY (sqlc.arg(statuses)::text[]))
  AND (sqlc.narg(service_type_id)::text IS NULL OR service_type_id = sqlc.narg(service_type_id))
  AND (sqlc.narg(q)::text IS NULL
       OR lpad(number::text, greatest(6, length(number::text)), '0') LIKE '%' || sqlc.narg(q) || '%'
       OR student_snapshot ->> 'full_name' ILIKE '%' || sqlc.narg(q) || '%')
ORDER BY COALESCE(status IN ('submitted', 'in_progress') AND due_at < sqlc.arg(now), false) DESC,
         due_at NULLS LAST, created_at, id
LIMIT sqlc.arg(lim) OFFSET sqlc.arg(off);

-- name: CountStaffApplications :one
SELECT count(*) FROM applications
WHERE (sqlc.narg(faculty_id)::uuid IS NULL OR faculty_id = sqlc.narg(faculty_id))
  AND (cardinality(sqlc.arg(statuses)::text[]) = 0 OR status = ANY (sqlc.arg(statuses)::text[]))
  AND (sqlc.narg(service_type_id)::text IS NULL OR service_type_id = sqlc.narg(service_type_id))
  AND (sqlc.narg(q)::text IS NULL
       OR lpad(number::text, greatest(6, length(number::text)), '0') LIKE '%' || sqlc.narg(q) || '%'
       OR student_snapshot ->> 'full_name' ILIKE '%' || sqlc.narg(q) || '%');

-- ready_today — сколько заявок деканат перевёл в ready с начала дня (мгновенные справки не считаются).
-- name: StaffStats :one
SELECT count(*) FILTER (WHERE a.status = 'submitted')   AS submitted,
       count(*) FILTER (WHERE a.status = 'in_progress') AS in_progress,
       count(*) FILTER (WHERE a.status = 'needs_info')  AS needs_info,
       count(*) FILTER (WHERE a.status IN ('submitted', 'in_progress') AND a.due_at < sqlc.arg(now)) AS overdue,
       (SELECT count(DISTINCT h.application_id) FROM status_history h
        JOIN applications r ON r.id = h.application_id
        WHERE h.status = 'ready' AND h.actor_role = 'staff' AND h.created_at >= sqlc.arg(day_start)
          AND (sqlc.narg(faculty_id)::uuid IS NULL OR r.faculty_id = sqlc.narg(faculty_id))) AS ready_today
FROM applications a
WHERE (sqlc.narg(faculty_id)::uuid IS NULL OR a.faculty_id = sqlc.narg(faculty_id));

-- ---------- Детали заявки ----------

-- name: ListStatusHistory :many
SELECT * FROM status_history WHERE application_id = sqlc.arg(application_id) ORDER BY id;

-- name: InsertMessage :one
INSERT INTO messages (id, application_id, author_role, author_id, author_label, text, created_at)
VALUES (sqlc.arg(id), sqlc.arg(application_id), sqlc.arg(author_role), sqlc.arg(author_id), sqlc.arg(author_label),
        sqlc.arg(text), sqlc.arg(now))
RETURNING *;

-- name: ListMessages :many
SELECT * FROM messages WHERE application_id = sqlc.arg(application_id) ORDER BY created_at, id;

-- name: InsertAttachment :exec
INSERT INTO attachments (id, application_id, uploaded_by_role, uploaded_by_id, file_name, content_type, size, data,
                         is_result, created_at)
VALUES (sqlc.arg(id), sqlc.arg(application_id), sqlc.arg(uploaded_by_role), sqlc.arg(uploaded_by_id),
        sqlc.arg(file_name), sqlc.arg(content_type), sqlc.arg(size), sqlc.arg(data), sqlc.arg(is_result), sqlc.arg(now));

-- Без содержимого файлов: для карточки заявки.
-- name: ListAttachments :many
SELECT id, uploaded_by_role, file_name, content_type, size, is_result, created_at
FROM attachments WHERE application_id = sqlc.arg(application_id) ORDER BY created_at, id;

-- Вложение ищется только внутри заявки, доступ к которой уже проверен.
-- name: GetAttachment :one
SELECT * FROM attachments WHERE id = sqlc.arg(id) AND application_id = sqlc.arg(application_id);

-- ---------- Справки ----------

-- name: CreateCertificate :exec
INSERT INTO certificates (code, application_id, title, holder, faculty_short, issued_at, valid_until)
VALUES (sqlc.arg(code), sqlc.arg(application_id), sqlc.arg(title), sqlc.arg(holder), sqlc.arg(faculty_short),
        sqlc.arg(issued_at), sqlc.arg(valid_until));

-- name: GetCertificateByApplication :one
SELECT * FROM certificates WHERE application_id = sqlc.arg(application_id);

-- name: GetCertificate :one
SELECT * FROM certificates WHERE code = sqlc.arg(code);
