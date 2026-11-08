-- +goose Up
-- Подпись устройства для списка сеансов: «браузер · система». Ни User-Agent целиком, ни IP не храним (auth.yaml).
ALTER TABLE sessions ADD COLUMN device text NOT NULL DEFAULT 'Неизвестное устройство';

-- +goose Down
ALTER TABLE sessions DROP COLUMN device;
