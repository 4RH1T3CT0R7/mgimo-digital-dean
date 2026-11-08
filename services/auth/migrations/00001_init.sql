-- +goose Up
CREATE TABLE users (
    id            uuid PRIMARY KEY,
    login         text NOT NULL UNIQUE,
    password_hash text NOT NULL,
    role          text NOT NULL CHECK (role IN ('student', 'staff', 'admin')),
    display_name  text NOT NULL,
    faculty_id    uuid,
    created_at    timestamptz NOT NULL DEFAULT now(),
    -- факультет есть ровно у сотрудников (data-model.md)
    CHECK ((role = 'staff') = (faculty_id IS NOT NULL))
);

-- Хранится только SHA-256 от токена: утечка таблицы не даёт войти чужими сессиями.
CREATE TABLE sessions (
    token_hash   bytea PRIMARY KEY,
    user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at   timestamptz NOT NULL,
    expires_at   timestamptz NOT NULL,
    last_seen_at timestamptz NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);

CREATE TABLE login_attempts (
    id         bigserial PRIMARY KEY,
    login      text NOT NULL,
    ip         inet,
    success    boolean NOT NULL,
    created_at timestamptz NOT NULL
);
CREATE INDEX login_attempts_login_idx ON login_attempts (login, created_at);
CREATE INDEX login_attempts_ip_idx ON login_attempts (ip, created_at);

-- +goose Down
DROP TABLE login_attempts;
DROP TABLE sessions;
DROP TABLE users;
