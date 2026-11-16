-- +goose Up
-- Электронный студенческий (D60). Код проверки выдаётся один раз; holder, faculty_short, course и срок
-- нужны публичной проверке и обновляются при каждом открытии карточки студентом.
-- student_id — ID из auth/academic, поэтому без внешнего ключа.
CREATE TABLE student_cards (
    student_id    uuid PRIMARY KEY,
    code          text NOT NULL UNIQUE CHECK (code ~ '^[A-Z2-7]{10}$'),
    holder        text NOT NULL, -- «Фамилия И. О.», как в справке
    faculty_short text NOT NULL,
    course        int NOT NULL,
    issued_at     timestamptz NOT NULL,
    valid_until   date NOT NULL
);

-- +goose Down
DROP TABLE student_cards;
