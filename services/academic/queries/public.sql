-- name: GetMyProfile :one
SELECT sqlc.embed(s), f.short_name AS faculty_short, f.name AS faculty_name,
       p.code AS program_code, p.name AS program_name, g.name AS group_name
FROM students s
JOIN faculties f ON f.id = s.faculty_id
JOIN programs p ON p.id = s.program_id
JOIN groups g ON g.id = s.academic_group_id
WHERE s.id = sqlc.arg(student_id);

-- name: ListMyLanguageGroups :many
SELECT g.id, g.name, g.language
FROM student_language_groups lg
JOIN groups g ON g.id = lg.group_id
WHERE lg.student_id = sqlc.arg(student_id)
ORDER BY g.name, g.id;

-- name: GetCurrentTerm :one
SELECT * FROM terms WHERE is_current;

-- name: ListFaculties :many
SELECT * FROM faculties ORDER BY short_name, id;

-- name: ListStaffGroups :many
SELECT g.id, g.name, g.kind, g.course, f.short_name AS faculty_short
FROM groups g
JOIN faculties f ON f.id = g.faculty_id
WHERE sqlc.narg(faculty_id)::uuid IS NULL OR g.faculty_id = sqlc.narg(faculty_id)
ORDER BY g.name, g.id;

-- name: GetScopedGroup :one
SELECT * FROM groups
WHERE id = sqlc.arg(group_id)
  AND (sqlc.narg(faculty_id)::uuid IS NULL OR faculty_id = sqlc.narg(faculty_id));

-- name: ListMyLessons :many
SELECT sqlc.embed(l), d.name AS discipline_name, t.short_name AS teacher_short
FROM lessons l
JOIN disciplines d ON d.id = l.discipline_id
LEFT JOIN teachers t ON t.id = l.teacher_id
WHERE (l.date BETWEEN sqlc.arg(from_date)::date AND sqlc.arg(to_date)::date
       OR (l.status = 'moved' AND l.prev_date BETWEEN sqlc.arg(from_date)::date AND sqlc.arg(to_date)::date))
  AND EXISTS (
      SELECT 1 FROM lesson_groups lg
      JOIN students s ON s.id = sqlc.arg(student_id)
      WHERE lg.lesson_id = l.id AND (
          lg.group_id = s.academic_group_id OR EXISTS (
              SELECT 1 FROM student_language_groups slg
              WHERE slg.student_id = sqlc.arg(student_id) AND slg.group_id = lg.group_id
          )
      )
  )
ORDER BY l.date, l.start_time, l.id;

-- name: ListStaffLessons :many
SELECT sqlc.embed(l), d.name AS discipline_name, t.short_name AS teacher_short
FROM lessons l
JOIN disciplines d ON d.id = l.discipline_id
LEFT JOIN teachers t ON t.id = l.teacher_id
WHERE (l.date BETWEEN sqlc.arg(from_date)::date AND sqlc.arg(to_date)::date
       OR (l.status = 'moved' AND l.prev_date BETWEEN sqlc.arg(from_date)::date AND sqlc.arg(to_date)::date))
  AND EXISTS (
      SELECT 1 FROM lesson_groups lg
      JOIN groups g ON g.id = lg.group_id
      WHERE lg.lesson_id = l.id AND g.id = sqlc.arg(group_id)
        AND (sqlc.narg(faculty_id)::uuid IS NULL OR g.faculty_id = sqlc.narg(faculty_id))
  )
ORDER BY l.date, l.start_time, l.id;

-- name: ListLessonGroups :many
SELECT g.id, g.name, g.faculty_id
FROM lesson_groups lg JOIN groups g ON g.id = lg.group_id
WHERE lg.lesson_id = sqlc.arg(lesson_id)
ORDER BY g.id;

-- Группы всего расписания или replay читаются одним запросом.
-- name: ListLessonGroupsBatch :many
SELECT lg.lesson_id, g.id, g.name, g.faculty_id
FROM lesson_groups lg JOIN groups g ON g.id = lg.group_id
WHERE lg.lesson_id = ANY(sqlc.arg(lesson_ids)::uuid[])
ORDER BY lg.lesson_id, g.id;

-- name: LockScopedLesson :one
SELECT sqlc.embed(l), d.name AS discipline_name, t.short_name AS teacher_short
FROM lessons l
JOIN disciplines d ON d.id = l.discipline_id
LEFT JOIN teachers t ON t.id = l.teacher_id
WHERE l.id = sqlc.arg(lesson_id)
  AND EXISTS (
      SELECT 1 FROM lesson_groups lg JOIN groups g ON g.id = lg.group_id
      WHERE lg.lesson_id = l.id
        AND (sqlc.narg(faculty_id)::uuid IS NULL OR g.faculty_id = sqlc.narg(faculty_id))
  )
FOR UPDATE OF l;

-- name: UpdateLesson :one
UPDATE lessons SET
    date = sqlc.arg(date), start_time = sqlc.arg(start_time), end_time = sqlc.arg(end_time),
    pair_number = sqlc.arg(pair_number), room_building = sqlc.narg(room_building), room_number = sqlc.narg(room_number),
    status = sqlc.arg(status), change_type = sqlc.arg(change_type),
    prev_date = CASE WHEN changed_at IS NULL THEN date ELSE prev_date END,
    prev_start_time = CASE WHEN changed_at IS NULL THEN start_time ELSE prev_start_time END,
    prev_end_time = CASE WHEN changed_at IS NULL THEN end_time ELSE prev_end_time END,
    prev_room_building = CASE WHEN changed_at IS NULL THEN room_building ELSE prev_room_building END,
    prev_room_number = CASE WHEN changed_at IS NULL THEN room_number ELSE prev_room_number END,
    change_reason = sqlc.narg(change_reason), changed_at = sqlc.arg(changed_at), updated_at = sqlc.arg(changed_at)
WHERE lessons.id = sqlc.arg(lesson_id)
  AND EXISTS (
      SELECT 1 FROM lesson_groups lg JOIN groups g ON g.id = lg.group_id
      WHERE lg.lesson_id = lessons.id
        AND (sqlc.narg(faculty_id)::uuid IS NULL OR g.faculty_id = sqlc.narg(faculty_id))
  )
RETURNING lessons.*;

-- name: ListMyDisciplines :many
SELECT sqlc.embed(sd), d.name AS discipline_name, t.short_name AS teacher_short
FROM student_disciplines sd
JOIN disciplines d ON d.id = sd.discipline_id
LEFT JOIN teachers t ON t.id = sd.teacher_id
WHERE sd.student_id = sqlc.arg(student_id)
ORDER BY sd.semester DESC, d.name, d.id;

-- name: ListMyControlPoints :many
SELECT cp.*, d.name AS discipline_name
FROM control_points cp
JOIN disciplines d ON d.id = cp.discipline_id
WHERE cp.student_id = sqlc.arg(student_id) AND cp.semester = sqlc.arg(semester)
ORDER BY cp.date, cp.id;

-- name: ListTermPeriods :many
SELECT * FROM term_periods WHERE term_id = sqlc.arg(term_id) ORDER BY start_date;

-- name: GetMyRating :one
SELECT semester, percent::float8 AS percent, percentile FROM student_ratings
WHERE student_id = sqlc.arg(student_id) AND semester < sqlc.arg(current_semester)
ORDER BY semester DESC LIMIT 1;

-- name: ListChangedLessonsForReplay :many
SELECT sqlc.embed(l), d.name AS discipline_name, t.short_name AS teacher_short
FROM lessons l
JOIN disciplines d ON d.id = l.discipline_id
LEFT JOIN teachers t ON t.id = l.teacher_id
WHERE l.change_type IS NOT NULL
ORDER BY l.id;
