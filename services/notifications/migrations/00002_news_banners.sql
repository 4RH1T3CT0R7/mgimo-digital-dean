-- +goose Up
-- Мероприятие — новость с датой и местом; «Пойду» хранится как отметка прочтения (D61).
ALTER TABLE notifications
    ADD COLUMN event_starts_at timestamptz,
    ADD COLUMN event_place text CHECK (char_length(event_place) BETWEEN 1 AND 120),
    ADD CHECK ((event_starts_at IS NULL) = (event_place IS NULL)),
    ADD CHECK (event_starts_at IS NULL OR type = 'news');
ALTER TABLE notification_reads ADD COLUMN going_at timestamptz;

-- Баннеры администратора: адресат как у объявлений, но без одного студента; срок показа обязателен.
CREATE TABLE banners (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 80),
    body text CHECK (char_length(body) BETWEEN 1 AND 200),
    priority text NOT NULL CHECK (priority IN ('normal', 'urgent')),
    link_url text CHECK (char_length(link_url) BETWEEN 1 AND 500),
    link_label text CHECK (char_length(link_label) BETWEEN 1 AND 30),
    audience_kind text NOT NULL CHECK (audience_kind IN ('all', 'faculty', 'course', 'group')),
    audience_faculty_id uuid,
    audience_course integer,
    audience_group_id uuid,
    starts_at timestamptz NOT NULL,
    -- Равенство — только у снятого до начала показа (POST /admin/banners/{id}/end).
    ends_at timestamptz NOT NULL CHECK (ends_at >= starts_at),
    author_id uuid NOT NULL,
    created_at timestamptz NOT NULL,
    CHECK ((link_url IS NULL) = (link_label IS NULL)),
    CHECK ((audience_kind IN ('faculty', 'course', 'group')) = (audience_faculty_id IS NOT NULL)),
    CHECK ((audience_kind = 'course') = (audience_course IS NOT NULL)),
    CHECK (audience_course BETWEEN 1 AND 6),
    CHECK ((audience_kind = 'group') = (audience_group_id IS NOT NULL))
);
CREATE INDEX banners_period ON banners (ends_at, starts_at);

CREATE TABLE banner_dismissals (
    banner_id uuid NOT NULL REFERENCES banners(id) ON DELETE CASCADE,
    user_id uuid NOT NULL,
    PRIMARY KEY (banner_id, user_id)
);

-- +goose Down
DROP TABLE banner_dismissals;
DROP TABLE banners;
ALTER TABLE notification_reads DROP COLUMN going_at;
ALTER TABLE notifications DROP COLUMN event_place, DROP COLUMN event_starts_at;
