package platform

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
)

// Error — ошибка в формате контракта (docs/contracts/README.md, «Ошибки»).
// Хендлеры возвращают её как обычный error; ResponseErrorHandler превращает её в ответ.
type Error struct {
	Status     int
	Code       string
	Message    string            // по-русски, можно показать пользователю
	Fields     map[string]string // ошибки по полям для validation_failed
	RetryAfter int               // секунды, для 429
}

func (e *Error) Error() string { return e.Code + ": " + e.Message }

func Unauthenticated() *Error {
	return &Error{Status: http.StatusUnauthorized, Code: "unauthenticated", Message: "Войдите в систему"}
}

func InvalidCredentials() *Error {
	return &Error{Status: http.StatusUnauthorized, Code: "invalid_credentials", Message: "Неверный логин или пароль"}
}

func Forbidden() *Error {
	return &Error{Status: http.StatusForbidden, Code: "forbidden", Message: "Недостаточно прав"}
}

// NotFound — и для несуществующего, и для чужого объекта (так нельзя узнать, что чужое существует).
func NotFound() *Error {
	return &Error{Status: http.StatusNotFound, Code: "not_found", Message: "Не найдено"}
}

func Validation(fields map[string]string) *Error {
	return &Error{Status: http.StatusBadRequest, Code: "validation_failed", Message: "Проверьте введённые данные", Fields: fields}
}

func Conflict(code, message string) *Error {
	return &Error{Status: http.StatusConflict, Code: code, Message: message}
}

func TooManyAttempts(retryAfterSec int) *Error {
	return &Error{Status: http.StatusTooManyRequests, Code: "too_many_attempts",
		Message: "Слишком много попыток. Попробуйте позже", RetryAfter: retryAfterSec}
}

func Internal() *Error {
	return &Error{Status: http.StatusInternalServerError, Code: "internal", Message: "Что-то пошло не так. Попробуйте ещё раз"}
}

// WriteError пишет ошибку в формате контракта. Любая ошибка не типа *Error становится 500 без подробностей.
func WriteError(w http.ResponseWriter, err error) {
	var e *Error
	if !errors.As(err, &e) {
		e = Internal()
	}
	body := map[string]any{"code": e.Code, "message": e.Message}
	if len(e.Fields) > 0 {
		body["details"] = map[string]any{"fields": e.Fields}
	}
	if e.RetryAfter > 0 {
		w.Header().Set("Retry-After", strconv.Itoa(e.RetryAfter))
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(e.Status)
	_ = json.NewEncoder(w).Encode(body)
}

// RequestErrorHandler — для ошибок разбора запроса (неверный JSON, параметры): всегда 400.
// Подключается в StrictHTTPServerOptions.RequestErrorHandlerFunc и StdHTTPServerOptions.ErrorHandlerFunc.
func RequestErrorHandler(w http.ResponseWriter, r *http.Request, err error) {
	Log(r.Context()).Info("bad_request", "error", err.Error())
	WriteError(w, &Error{Status: http.StatusBadRequest, Code: "validation_failed", Message: "Некорректный запрос"})
}

// ResponseErrorHandler — для ошибок, которые вернул хендлер.
// Подключается в StrictHTTPServerOptions.ResponseErrorHandlerFunc.
func ResponseErrorHandler(w http.ResponseWriter, r *http.Request, err error) {
	var e *Error
	if !errors.As(err, &e) || e.Status >= 500 {
		Log(r.Context()).Error("handler_error", "error", err.Error())
	}
	WriteError(w, err)
}
