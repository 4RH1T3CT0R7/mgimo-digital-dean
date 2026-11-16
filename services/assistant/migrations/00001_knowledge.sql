-- +goose Up
-- База знаний помощника (D66): документы деканата и их фрагменты для полнотекстового поиска.
CREATE TABLE knowledge_documents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 200),
    source_name text CHECK (char_length(source_name) <= 200),
    text text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 300000),
    chars integer NOT NULL CHECK (chars > 0),
    author_id uuid NOT NULL,
    author_label text NOT NULL,
    created_at timestamptz NOT NULL,
    active boolean NOT NULL DEFAULT true
);

CREATE TABLE knowledge_chunks (
    document_id uuid NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
    n integer NOT NULL CHECK (n >= 0),
    text text NOT NULL,
    tsv tsvector GENERATED ALWAYS AS (to_tsvector('russian', text)) STORED,
    PRIMARY KEY (document_id, n)
);
CREATE INDEX knowledge_chunks_tsv ON knowledge_chunks USING gin (tsv);

-- +goose Down
DROP TABLE knowledge_chunks;
DROP TABLE knowledge_documents;
