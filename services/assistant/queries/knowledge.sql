-- name: ListDocuments :many
SELECT d.id, d.title, d.source_name, d.chars, d.author_label, d.created_at, d.active,
       (SELECT count(*) FROM knowledge_chunks c WHERE c.document_id = d.id) AS chunks
FROM knowledge_documents d
ORDER BY d.created_at DESC, d.id DESC;

-- name: GetDocument :one
SELECT d.id, d.title, d.source_name, d.chars, d.author_label, d.created_at, d.active,
       (SELECT count(*) FROM knowledge_chunks c WHERE c.document_id = d.id) AS chunks
FROM knowledge_documents d
WHERE d.id = $1;

-- name: InsertDocument :exec
INSERT INTO knowledge_documents (id, title, source_name, text, chars, author_id, author_label, created_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8);

-- name: InsertChunks :exec
INSERT INTO knowledge_chunks (document_id, n, text)
SELECT sqlc.arg(document_id)::uuid, u.ord - 1, u.chunk
FROM unnest(sqlc.arg(chunks)::text[]) WITH ORDINALITY AS u(chunk, ord);

-- name: SetDocumentActive :execrows
UPDATE knowledge_documents SET active = $2 WHERE id = $1;

-- name: DeleteDocument :execrows
DELETE FROM knowledge_documents WHERE id = $1;

-- SearchChunks — лучшие фрагменты включённых документов. Запрос — ИЛИ по леммам вопроса с русской
-- морфологией («пересдачу» найдёт «пересдача»); plainto_tsquery сам экранирует ввод, « & » меняем на « | ».
-- name: SearchChunks :many
SELECT d.id AS document_id, d.title, c.n, c.text, ts_rank_cd(c.tsv, query.q)::real AS rank
FROM knowledge_chunks c
JOIN knowledge_documents d ON d.id = c.document_id,
     (SELECT replace(plainto_tsquery('russian', sqlc.arg(question)::text)::text, ' & ', ' | ')::tsquery AS q) AS query
WHERE d.active AND c.tsv @@ query.q
ORDER BY ts_rank_cd(c.tsv, query.q) DESC, d.created_at DESC, c.n
LIMIT sqlc.arg(max_chunks)::integer;
