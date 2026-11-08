-- name: CreateUser :exec
INSERT INTO users (id, login, password_hash, role, display_name, faculty_id)
VALUES (sqlc.arg(id), sqlc.arg(login), sqlc.arg(password_hash), sqlc.arg(role), sqlc.arg(display_name), sqlc.narg(faculty_id));

-- name: GetUserByLogin :one
SELECT * FROM users WHERE login = sqlc.arg(login);

-- name: GetUserByID :one
SELECT * FROM users WHERE id = sqlc.arg(id);

-- Неудачные попытки по логину за окно, но только после последнего успешного входа.
-- name: CountRecentFailuresByLogin :one
SELECT count(*) FROM login_attempts a
WHERE a.login = sqlc.arg(login)
  AND a.success = false
  AND a.created_at > sqlc.arg(since)
  AND a.created_at > COALESCE(
      (SELECT max(s.created_at) FROM login_attempts s WHERE s.login = sqlc.arg(login) AND s.success),
      '-infinity'::timestamptz);

-- name: CountRecentFailuresByIP :one
SELECT count(*) FROM login_attempts
WHERE ip = sqlc.arg(ip) AND success = false AND created_at > sqlc.arg(since);

-- name: InsertLoginAttempt :exec
INSERT INTO login_attempts (login, ip, success, created_at)
VALUES (sqlc.arg(login), sqlc.narg(ip), sqlc.arg(success), sqlc.arg(created_at));

-- name: CreateSession :exec
INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_seen_at)
VALUES (sqlc.arg(token_hash), sqlc.arg(user_id), sqlc.arg(now), sqlc.arg(expires_at), sqlc.arg(now));

-- name: GetActiveSession :one
SELECT u.id, u.role, u.faculty_id
FROM sessions s JOIN users u ON u.id = s.user_id
WHERE s.token_hash = sqlc.arg(token_hash) AND s.expires_at > sqlc.arg(now);

-- name: TouchSession :exec
UPDATE sessions SET last_seen_at = sqlc.arg(now) WHERE token_hash = sqlc.arg(token_hash);

-- name: DeleteSession :exec
DELETE FROM sessions WHERE token_hash = sqlc.arg(token_hash);

-- name: DeleteExpiredSessions :exec
DELETE FROM sessions WHERE expires_at <= sqlc.arg(now);
