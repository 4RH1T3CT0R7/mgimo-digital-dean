-- Тестовые аккаунты (docs/contracts/seed.md). Пароли в репозитории не хранятся (D38): только bcrypt-хеши.
-- Пароли — у капитана; новый хеш: printf '%s\n' 'пароль' | go run ./cmd/hashpw
INSERT INTO users (id, login, password_hash, role, display_name, faculty_id) VALUES
    ('30000000-0000-4000-8000-000000000001', 'student.mo', '$2a$12$BrOFcydD5pZ.Bv34uPOF7uXpgLSSNXcxVjnrDWUJGb6drxB/iHrxO', 'student', 'Лебедева А. В.', NULL),
    ('30000000-0000-4000-8000-000000000002', 'student.meo', '$2a$12$2sYAqVphluYVOz8CwXf2YehuzHDvgwEEob.fQO4g4ZYJhQLW20KQG', 'student', 'Соколов М. О.', NULL),
    ('40000000-0000-4000-8000-000000000001', 'dekanat.mo', '$2a$12$24RQ5yKLXR2N9H8wPwEX8.zBCnZL4bAhI6saqcWldRHA/d4U1D2h.', 'staff', 'Деканат ФМО', '10000000-0000-4000-8000-000000000001'),
    ('40000000-0000-4000-8000-000000000002', 'dekanat.meo', '$2a$12$TjqyWzhSoBD1tWAICuoaS./IwUveFaijwJNZSEZcKQzeweb2WqhxS', 'staff', 'Деканат МЭО', '10000000-0000-4000-8000-000000000002'),
    ('40000000-0000-4000-8000-000000000003', 'admin', '$2a$12$kadxI04cBnEs/sEhs4y/3Ou.bwPgQWxWJGtH.tCU9oVYbQf3wNOp.', 'admin', 'Администратор', NULL)
ON CONFLICT (id) DO NOTHING;
