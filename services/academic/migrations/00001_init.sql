-- +goose Up
CREATE TABLE faculties (
    id         uuid PRIMARY KEY,
    short_name text NOT NULL UNIQUE,
    name       text NOT NULL
);

CREATE TABLE programs (
    id         uuid PRIMARY KEY,
    faculty_id uuid NOT NULL REFERENCES faculties (id),
    code       text NOT NULL,
    name       text NOT NULL,
    level      text NOT NULL CHECK (level IN ('bachelor', 'specialist', 'master'))
);

CREATE TABLE terms (
    id            uuid PRIMARY KEY,
    academic_year text NOT NULL,
    term          text NOT NULL CHECK (term IN ('autumn', 'spring')),
    start_date    date NOT NULL,
    end_date      date NOT NULL,
    is_current    boolean NOT NULL DEFAULT false,
    CHECK (start_date <= end_date)
);
CREATE UNIQUE INDEX terms_one_current_idx ON terms (is_current) WHERE is_current;

CREATE TABLE groups (
    id         uuid PRIMARY KEY,
    faculty_id uuid NOT NULL REFERENCES faculties (id),
    program_id uuid REFERENCES programs (id),
    name       text NOT NULL UNIQUE,
    kind       text NOT NULL CHECK (kind IN ('academic', 'language')),
    course     integer NOT NULL CHECK (course BETWEEN 1 AND 6),
    language   text
);
CREATE INDEX groups_faculty_idx ON groups (faculty_id);

-- ID совпадает с auth.users.id; внешних ключей в чужую БД нет.
CREATE TABLE students (
    id                uuid PRIMARY KEY,
    full_name         text NOT NULL,
    short_name        text NOT NULL,
    faculty_id        uuid NOT NULL REFERENCES faculties (id),
    program_id        uuid NOT NULL REFERENCES programs (id),
    course            integer NOT NULL CHECK (course BETWEEN 1 AND 6),
    academic_group_id uuid NOT NULL REFERENCES groups (id),
    student_card_no   text NOT NULL UNIQUE,
    study_form        text NOT NULL CHECK (study_form IN ('full_time', 'part_time', 'extramural')),
    funding           text NOT NULL CHECK (funding IN ('budget', 'contract')),
    study_level       text NOT NULL CHECK (study_level IN ('bachelor', 'specialist', 'master')),
    enrollment_year   integer NOT NULL,
    status            text NOT NULL CHECK (status IN ('studying', 'academic_leave'))
);
CREATE INDEX students_faculty_course_idx ON students (faculty_id, course);
CREATE INDEX students_group_idx ON students (academic_group_id);

CREATE TABLE student_language_groups (
    student_id uuid NOT NULL REFERENCES students (id) ON DELETE CASCADE,
    group_id   uuid NOT NULL REFERENCES groups (id),
    PRIMARY KEY (student_id, group_id)
);
CREATE INDEX student_language_groups_group_idx ON student_language_groups (group_id);

CREATE TABLE teachers (
    id         uuid PRIMARY KEY,
    full_name  text NOT NULL,
    short_name text NOT NULL
);

CREATE TABLE disciplines (
    id   uuid PRIMARY KEY,
    name text NOT NULL
);

CREATE TABLE lessons (
    id                 uuid PRIMARY KEY,
    discipline_id      uuid NOT NULL REFERENCES disciplines (id),
    kind               text NOT NULL CHECK (kind IN ('lecture', 'seminar', 'language', 'consultation', 'credit', 'exam')),
    format             text NOT NULL CHECK (format IN ('offline', 'online')),
    date               date NOT NULL,
    start_time         time NOT NULL,
    end_time           time NOT NULL,
    pair_number        integer NOT NULL CHECK (pair_number BETWEEN 1 AND 8),
    room_building      text,
    room_number        text,
    teacher_id         uuid REFERENCES teachers (id),
    status             text NOT NULL CHECK (status IN ('scheduled', 'moved', 'cancelled', 'changed')),
    change_type        text CHECK (change_type IN ('moved', 'cancelled', 'room_changed')),
    prev_date          date,
    prev_start_time    time,
    prev_end_time      time,
    prev_room_building text,
    prev_room_number   text,
    change_reason      text,
    changed_at         timestamptz,
    updated_at         timestamptz NOT NULL,
    CHECK (start_time < end_time)
);
CREATE INDEX lessons_date_idx ON lessons (date);
CREATE INDEX lessons_prev_date_idx ON lessons (prev_date) WHERE prev_date IS NOT NULL;

CREATE TABLE lesson_groups (
    lesson_id uuid NOT NULL REFERENCES lessons (id) ON DELETE CASCADE,
    group_id  uuid NOT NULL REFERENCES groups (id),
    PRIMARY KEY (lesson_id, group_id)
);
CREATE INDEX lesson_groups_group_idx ON lesson_groups (group_id);

CREATE TABLE student_disciplines (
    id                 uuid PRIMARY KEY,
    student_id         uuid NOT NULL REFERENCES students (id) ON DELETE CASCADE,
    discipline_id      uuid NOT NULL REFERENCES disciplines (id),
    semester           integer NOT NULL CHECK (semester BETWEEN 1 AND 12),
    academic_year      text NOT NULL,
    term               text NOT NULL CHECK (term IN ('autumn', 'spring')),
    control_form       text NOT NULL CHECK (control_form IN ('exam', 'credit', 'graded_credit')),
    hours              integer NOT NULL CHECK (hours >= 0),
    credits            integer NOT NULL CHECK (credits >= 0),
    teacher_id         uuid REFERENCES teachers (id),
    percent            integer CHECK (percent BETWEEN 0 AND 100),
    passed             boolean,
    result_date        date,
    current_score      integer CHECK (current_score BETWEEN 0 AND 100),
    max_to_date        integer CHECK (max_to_date BETWEEN 0 AND 100),
    attendance_percent integer CHECK (attendance_percent BETWEEN 0 AND 100),
    updated_at         timestamptz NOT NULL,
    UNIQUE (student_id, discipline_id, semester)
);

CREATE TABLE control_points (
    id            uuid PRIMARY KEY,
    student_id    uuid NOT NULL,
    discipline_id uuid NOT NULL,
    semester      integer NOT NULL,
    date          date NOT NULL,
    title         text NOT NULL,
    score         integer CHECK (score >= 0),
    max           integer NOT NULL CHECK (max >= 0),
    FOREIGN KEY (student_id, discipline_id, semester)
        REFERENCES student_disciplines (student_id, discipline_id, semester) ON DELETE CASCADE,
    CHECK (score <= max)
);
CREATE INDEX control_points_student_discipline_idx ON control_points (student_id, discipline_id, semester);

CREATE TABLE student_ratings (
    student_id uuid NOT NULL REFERENCES students (id) ON DELETE CASCADE,
    semester   integer NOT NULL CHECK (semester BETWEEN 1 AND 12),
    percent    numeric(5,2) NOT NULL CHECK (percent BETWEEN 0 AND 100),
    percentile integer CHECK (percentile BETWEEN 0 AND 100),
    PRIMARY KEY (student_id, semester)
);

-- +goose Down
DROP TABLE student_ratings;
DROP TABLE control_points;
DROP TABLE student_disciplines;
DROP TABLE lesson_groups;
DROP TABLE lessons;
DROP TABLE disciplines;
DROP TABLE teachers;
DROP TABLE student_language_groups;
DROP TABLE students;
DROP TABLE groups;
DROP TABLE terms;
DROP TABLE programs;
DROP TABLE faculties;
