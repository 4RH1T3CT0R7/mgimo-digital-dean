-- +goose Up
-- Календарный план семестра (D62). Каникулы могут заканчиваться после terms.end_date.
CREATE TABLE term_periods (
    term_id    uuid NOT NULL REFERENCES terms (id) ON DELETE CASCADE,
    kind       text NOT NULL CHECK (kind IN ('study', 'credit_week', 'holidays', 'session', 'vacation')),
    start_date date NOT NULL,
    end_date   date NOT NULL,
    PRIMARY KEY (term_id, start_date),
    CHECK (start_date <= end_date)
);

-- +goose Down
DROP TABLE term_periods;
