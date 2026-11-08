package platform

import (
	"context"
	"net/http"

	"github.com/google/uuid"
)

type Role string

const (
	RoleStudent Role = "student"
	RoleStaff   Role = "staff"
	RoleAdmin   Role = "admin"
)

// Identity — кто делает запрос. Её выставляет только шлюз после проверки сессии в auth (D26);
// снаружи заголовки X-User-* срезаются, а сервисы доступны лишь во внутренней сети.
type Identity struct {
	UserID    uuid.UUID
	Role      Role
	FacultyID *uuid.UUID // только у staff
}

const (
	HeaderUserID    = "X-User-Id"
	HeaderUserRole  = "X-User-Role"
	HeaderFacultyID = "X-Faculty-Id"
)

// IdentityFromHeaders разбирает заголовки шлюза. ok=false, если личности нет или она некорректна.
func IdentityFromHeaders(h http.Header) (Identity, bool) {
	userID, err := uuid.Parse(h.Get(HeaderUserID))
	if err != nil {
		return Identity{}, false
	}
	id := Identity{UserID: userID, Role: Role(h.Get(HeaderUserRole))}
	switch id.Role {
	case RoleStudent, RoleAdmin:
	case RoleStaff:
		f, err := uuid.Parse(h.Get(HeaderFacultyID))
		if err != nil {
			return Identity{}, false // сотрудник без факультета — некорректная личность
		}
		id.FacultyID = &f
	default:
		return Identity{}, false
	}
	return id, true
}

// SetIdentityHeaders — обратная операция (для auth и тестов).
func SetIdentityHeaders(h http.Header, id Identity) {
	h.Set(HeaderUserID, id.UserID.String())
	h.Set(HeaderUserRole, string(id.Role))
	if id.FacultyID != nil {
		h.Set(HeaderFacultyID, id.FacultyID.String())
	}
}

func withIdentity(ctx context.Context, id Identity) context.Context {
	return context.WithValue(ctx, ctxIdentity, id)
}

// IdentityFrom — личность из контекста запроса.
func IdentityFrom(ctx context.Context) (Identity, bool) {
	id, ok := ctx.Value(ctxIdentity).(Identity)
	return id, ok
}

// RequireAuth — любой вошедший пользователь, иначе 401.
func RequireAuth(ctx context.Context) (Identity, error) {
	id, ok := IdentityFrom(ctx)
	if !ok {
		return Identity{}, Unauthenticated()
	}
	return id, nil
}

// RequireStudent — для эндпоинтов /me/*: только студент, иначе 401/403.
func RequireStudent(ctx context.Context) (Identity, error) {
	id, err := RequireAuth(ctx)
	if err != nil {
		return id, err
	}
	if id.Role != RoleStudent {
		return id, Forbidden()
	}
	return id, nil
}

// RequireStaffOrAdmin — для эндпоинтов /staff/*: сотрудник (свой факультет) или администратор, иначе 401/403.
func RequireStaffOrAdmin(ctx context.Context) (Identity, error) {
	id, err := RequireAuth(ctx)
	if err != nil {
		return id, err
	}
	if id.Role != RoleStaff && id.Role != RoleAdmin {
		return id, Forbidden()
	}
	return id, nil
}

// FacultyScope — фильтр по факультету для запросов сотрудника: nil означает «все факультеты» (admin).
func (id Identity) FacultyScope() *uuid.UUID {
	if id.Role == RoleAdmin {
		return nil
	}
	return id.FacultyID
}
