-- +goose Up
CREATE TABLE notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    type text NOT NULL CHECK (type IN ('news', 'announcement', 'schedule_change', 'application_status', 'application_message')),
    title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
    body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
    important boolean NOT NULL DEFAULT false,
    requires_ack boolean NOT NULL DEFAULT false CHECK (NOT requires_ack OR type = 'announcement'),
    link_kind text NOT NULL DEFAULT 'none' CHECK (link_kind IN ('none', 'application', 'lesson')),
    link_id uuid,
    link_date date,
    audience_kind text NOT NULL CHECK (audience_kind IN ('all', 'user', 'faculty', 'course', 'group')),
    audience_user_id uuid,
    audience_faculty_id uuid,
    audience_course integer,
    audience_group_id uuid,
    author_id uuid,
    author_label text,
    source_event_id uuid,
    created_at timestamptz NOT NULL,
    CHECK ((audience_kind = 'user') = (audience_user_id IS NOT NULL)),
    CHECK ((audience_kind IN ('faculty', 'course', 'group')) = (audience_faculty_id IS NOT NULL)),
    CHECK ((audience_kind = 'course') = (audience_course IS NOT NULL)),
    CHECK (audience_course BETWEEN 1 AND 6),
    CHECK ((audience_kind = 'group') = (audience_group_id IS NOT NULL))
);

-- Событие занятия создаёт строку для каждой группы. Для публикаций без события
-- уникальность исходного события не применяется.
CREATE UNIQUE INDEX notifications_source_recipient
    ON notifications (source_event_id, audience_group_id) NULLS NOT DISTINCT
    WHERE source_event_id IS NOT NULL;
CREATE INDEX notifications_audience_user ON notifications (audience_user_id);
CREATE INDEX notifications_audience_faculty ON notifications (audience_faculty_id, audience_course);
CREATE INDEX notifications_audience_group ON notifications (audience_group_id);

CREATE TABLE notification_reads (
    notification_id uuid NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    user_id uuid NOT NULL,
    read_at timestamptz NOT NULL,
    acked_at timestamptz,
    PRIMARY KEY (notification_id, user_id)
);
CREATE INDEX notification_reads_user ON notification_reads (user_id);

CREATE TABLE deadlines (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 120),
    description text CHECK (char_length(description) <= 1000),
    kind text NOT NULL CHECK (kind IN ('application', 'exam', 'credit', 'coursework', 'other')),
    due_at timestamptz NOT NULL,
    service_type_id text CHECK (service_type_id IS NULL OR kind = 'application'),
    audience_kind text NOT NULL CHECK (audience_kind IN ('all', 'user', 'faculty', 'course', 'group')),
    audience_user_id uuid,
    audience_faculty_id uuid,
    audience_course integer,
    audience_group_id uuid,
    author_id uuid,
    created_at timestamptz NOT NULL,
    CHECK ((audience_kind = 'user') = (audience_user_id IS NOT NULL)),
    CHECK ((audience_kind IN ('faculty', 'course', 'group')) = (audience_faculty_id IS NOT NULL)),
    CHECK ((audience_kind = 'course') = (audience_course IS NOT NULL)),
    CHECK (audience_course BETWEEN 1 AND 6),
    CHECK ((audience_kind = 'group') = (audience_group_id IS NOT NULL))
);
CREATE INDEX deadlines_due_at ON deadlines (due_at);

-- +goose StatementBegin
CREATE FUNCTION notification_matches(
    kind text, target_user uuid, target_faculty uuid, target_course integer, target_group uuid,
    student uuid, faculty uuid, course integer, groups uuid[]
) RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
    SELECT kind = 'all'
       OR (kind = 'user' AND target_user = student)
       OR (kind = 'faculty' AND target_faculty = faculty)
       OR (kind = 'course' AND target_faculty = faculty AND target_course = course)
       OR (kind = 'group' AND target_group = ANY(groups))
$$;
-- +goose StatementEnd

-- +goose Down
DROP FUNCTION notification_matches(text, uuid, uuid, integer, uuid, uuid, uuid, integer, uuid[]);
DROP TABLE deadlines;
DROP TABLE notification_reads;
DROP TABLE notifications;
