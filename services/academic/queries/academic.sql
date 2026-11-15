-- name: GetStudentCard :one
SELECT s.id, s.full_name, s.short_name, s.faculty_id,
       f.short_name AS faculty_short, f.name AS faculty_name,
       p.code AS program_code, p.name AS program_name,
       s.course, g.name AS group_name, s.student_card_no,
       s.study_form, s.funding, s.study_level
FROM students s
JOIN faculties f ON f.id = s.faculty_id
JOIN programs p ON p.id = s.program_id
JOIN groups g ON g.id = s.academic_group_id
WHERE s.id = sqlc.arg(student_id);

-- name: GetStudentMembership :one
SELECT id, faculty_id, course
FROM students
WHERE id = sqlc.arg(student_id);

-- name: ListStudentGroupIDs :many
SELECT academic_group_id AS id FROM students WHERE id = sqlc.arg(student_id)
UNION
SELECT group_id AS id FROM student_language_groups WHERE student_id = sqlc.arg(student_id)
ORDER BY id;

-- name: GetGroup :one
SELECT id, name, kind, course, faculty_id
FROM groups
WHERE id = sqlc.arg(group_id);

-- name: GetFaculty :one
SELECT id, short_name FROM faculties WHERE id = sqlc.arg(faculty_id);

-- name: ResolveAudience :many
SELECT s.id, s.short_name, g.name AS group_name
FROM students s
JOIN groups g ON g.id = s.academic_group_id
WHERE sqlc.arg(kind)::text = 'all'
   OR (sqlc.arg(kind)::text = 'faculty' AND s.faculty_id = sqlc.narg(faculty_id)::uuid)
   OR (sqlc.arg(kind)::text = 'course' AND s.faculty_id = sqlc.narg(faculty_id)::uuid
       AND s.course = sqlc.narg(course)::integer)
   OR (sqlc.arg(kind)::text = 'group' AND (
       s.academic_group_id = sqlc.narg(group_id)::uuid
       OR EXISTS (
           SELECT 1 FROM student_language_groups lg
           WHERE lg.student_id = s.id AND lg.group_id = sqlc.narg(group_id)::uuid
       )
   ))
   OR (sqlc.arg(kind)::text = 'user' AND s.id = sqlc.narg(user_id)::uuid)
ORDER BY s.short_name, s.id;
