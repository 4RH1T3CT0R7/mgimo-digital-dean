-- +goose Up
-- Оценка ответа деканата студентом (requests.yaml, putMyFeedback). NULL — оценки нет.
ALTER TABLE applications
    ADD COLUMN feedback_helpful boolean,
    ADD COLUMN feedback_comment text,
    ADD COLUMN feedback_at      timestamptz;

-- +goose Down
ALTER TABLE applications
    DROP COLUMN feedback_helpful,
    DROP COLUMN feedback_comment,
    DROP COLUMN feedback_at;
