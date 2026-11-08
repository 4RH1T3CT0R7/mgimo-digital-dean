-- +goose Up
-- Общая последовательность номеров заявок; наружу — 6 цифр с ведущими нулями (data-model.md, Б5).
CREATE SEQUENCE application_number_seq;

CREATE TABLE service_types (
    id                   text PRIMARY KEY, -- slug
    title                text NOT NULL,
    description          text NOT NULL,
    category             text NOT NULL CHECK (category IN ('certificates', 'deanery', 'finance', 'other')),
    kind                 text NOT NULL CHECK (kind IN ('instant_certificate', 'document', 'question')),
    sla_days             int NOT NULL CHECK (sla_days >= 0),
    fields               jsonb NOT NULL DEFAULT '[]', -- массив FormField из requests.yaml
    attachments_allowed  boolean NOT NULL DEFAULT false,
    attachments_required boolean NOT NULL DEFAULT false,
    attachments_hint     text,
    sort_order           int NOT NULL DEFAULT 0,
    active               boolean NOT NULL DEFAULT true
);

-- student_id и faculty_id — ID из других БД (auth/academic), поэтому без внешних ключей.
CREATE TABLE applications (
    id                uuid PRIMARY KEY,
    number            bigint NOT NULL UNIQUE DEFAULT nextval('application_number_seq'),
    student_id        uuid NOT NULL,
    faculty_id        uuid NOT NULL,
    service_type_id   text NOT NULL REFERENCES service_types (id),
    status            text NOT NULL CHECK (status IN ('submitted', 'in_progress', 'needs_info', 'ready', 'rejected', 'cancelled')),
    fields            jsonb NOT NULL DEFAULT '{}',
    comment           text,
    student_snapshot  jsonb NOT NULL, -- слепок getStudentCard на момент подачи (D32)
    created_at        timestamptz NOT NULL,
    updated_at        timestamptz NOT NULL,
    due_at            timestamptz,
    last_message_at   timestamptz,
    last_message_from text CHECK (last_message_from IN ('student', 'staff'))
);
ALTER SEQUENCE application_number_seq OWNED BY applications.number;
CREATE INDEX applications_student_idx ON applications (student_id, updated_at DESC);
CREATE INDEX applications_faculty_idx ON applications (faculty_id, status);

CREATE TABLE status_history (
    id             bigserial PRIMARY KEY,
    application_id uuid NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
    status         text NOT NULL,
    comment        text,
    actor_role     text NOT NULL CHECK (actor_role IN ('student', 'staff', 'system')),
    actor_id       uuid,
    created_at     timestamptz NOT NULL
);
CREATE INDEX status_history_application_idx ON status_history (application_id, id);

CREATE TABLE messages (
    id             uuid PRIMARY KEY,
    application_id uuid NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
    author_role    text NOT NULL CHECK (author_role IN ('student', 'staff')),
    author_id      uuid NOT NULL,
    author_label   text NOT NULL,
    text           text NOT NULL,
    created_at     timestamptz NOT NULL
);
CREATE INDEX messages_application_idx ON messages (application_id, created_at);

-- Файлы хранятся в БД: попадают в pg_dump и отдаются только через проверку прав (security.md §3).
CREATE TABLE attachments (
    id               uuid PRIMARY KEY,
    application_id   uuid NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
    uploaded_by_role text NOT NULL CHECK (uploaded_by_role IN ('student', 'staff')),
    uploaded_by_id   uuid NOT NULL,
    file_name        text NOT NULL,
    content_type     text NOT NULL CHECK (content_type IN ('application/pdf', 'image/jpeg', 'image/png')),
    size             int NOT NULL CHECK (size > 0 AND size <= 5242880),
    data             bytea NOT NULL,
    is_result        boolean NOT NULL DEFAULT false,
    created_at       timestamptz NOT NULL
);
CREATE INDEX attachments_application_idx ON attachments (application_id, created_at);

CREATE TABLE certificates (
    code           text PRIMARY KEY CHECK (code ~ '^[A-Z2-7]{10}$'),
    application_id uuid NOT NULL UNIQUE REFERENCES applications (id) ON DELETE CASCADE,
    title          text NOT NULL,
    holder         text NOT NULL, -- «Фамилия И. О.»
    faculty_short  text NOT NULL,
    issued_at      timestamptz NOT NULL,
    valid_until    date NOT NULL
);

-- +goose Down
DROP TABLE certificates;
DROP TABLE attachments;
DROP TABLE messages;
DROP TABLE status_history;
DROP TABLE applications;
DROP TABLE service_types;
