// Package app — логика сервиса auth: вход, выход, текущий пользователь, проверка сессии для шлюза.
// Это эталон для остальных сервисов: структура и приёмы описаны в services/auth/README.md.
package app

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/netip"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"

	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/platform"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/auth/internal/api"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/auth/internal/db"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/auth/internal/internalapi"
)

const (
	CookieName        = "sid"
	SessionTTL        = 24 * time.Hour
	AttemptWindow     = 15 * time.Minute
	MaxLoginFails     = 5  // неудач подряд на логин за окно
	MaxIPFails        = 30 // неудач с одного IP за окно
	DefaultBcryptCost = 12
)

// Server реализует strict-интерфейсы публичного (api) и внутреннего (internalapi) API.
type Server struct {
	q         *db.Queries
	log       *slog.Logger
	now       func() time.Time // в тестах подменяется; time.Now вызывается только в main
	cost      int
	dummyHash []byte
}

// New. cost — стоимость bcrypt: в проде DefaultBcryptCost, в тестах bcrypt.MinCost для скорости.
func New(pool *pgxpool.Pool, log *slog.Logger, now func() time.Time, cost int) (*Server, error) {
	// Хеш-пустышка: для несуществующего логина тоже считаем bcrypt, чтобы по времени ответа
	// нельзя было понять, есть ли такой пользователь.
	dummy, err := bcrypt.GenerateFromPassword([]byte("dummy-password"), cost)
	if err != nil {
		return nil, err
	}
	return &Server{q: db.New(pool), log: log, now: now, cost: cost, dummyHash: dummy}, nil
}

// Handlers собирает публичный (8080) и внутренний (8081) обработчики со всеми middleware.
func (s *Server) Handlers() (public, internal http.Handler) {
	strictOpts := api.StrictHTTPServerOptions{
		RequestErrorHandlerFunc:  platform.RequestErrorHandler,
		ResponseErrorHandlerFunc: platform.ResponseErrorHandler,
	}
	pub := api.HandlerWithOptions(api.NewStrictHandlerWithOptions(s, nil, strictOpts), api.StdHTTPServerOptions{
		BaseRouter:       platform.NewMux(),
		ErrorHandlerFunc: platform.RequestErrorHandler,
	})
	in := internalapi.HandlerWithOptions(internalapi.NewStrictHandlerWithOptions(s, nil, internalapi.StrictHTTPServerOptions{
		RequestErrorHandlerFunc:  platform.RequestErrorHandler,
		ResponseErrorHandlerFunc: platform.ResponseErrorHandler,
	}), internalapi.StdHTTPServerOptions{
		BaseRouter:       platform.NewMux(),
		ErrorHandlerFunc: platform.RequestErrorHandler,
	})
	return platform.Middleware(s.log, pub), platform.Middleware(s.log, in)
}

// ---------- Публичный API ----------

func (s *Server) Login(ctx context.Context, req api.LoginRequestObject) (api.LoginResponseObject, error) {
	if req.Body == nil {
		return nil, platform.Validation(nil)
	}
	log := platform.Log(ctx)
	login := strings.ToLower(strings.TrimSpace(req.Body.Login))
	ip, hasIP := platform.ClientIP(platform.RequestFrom(ctx))
	now := s.now()
	since := now.Add(-AttemptWindow)

	// 1. Лимиты — до проверки пароля (security.md §3, «Подбор пароля»).
	byLogin, err := s.q.CountRecentFailuresByLogin(ctx, db.CountRecentFailuresByLoginParams{Login: login, Since: since})
	if err != nil {
		return nil, err
	}
	var byIP int64
	if hasIP {
		if byIP, err = s.q.CountRecentFailuresByIP(ctx, db.CountRecentFailuresByIPParams{Ip: &ip, Since: since}); err != nil {
			return nil, err
		}
	}
	if byLogin >= MaxLoginFails || byIP >= MaxIPFails {
		log.Warn("security", "event", "login_locked", "ip", ipString(ip, hasIP))
		return nil, platform.TooManyAttempts(int(AttemptWindow.Seconds()))
	}

	// 2. Пароль. Для несуществующего логина сравниваем с пустышкой — время ответа одинаковое.
	user, err := s.q.GetUserByLogin(ctx, login)
	found := err == nil
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}
	hash := s.dummyHash
	if found {
		hash = []byte(user.PasswordHash)
	}
	ok := bcrypt.CompareHashAndPassword(hash, []byte(req.Body.Password)) == nil && found

	attempt := db.InsertLoginAttemptParams{Login: login, Success: ok, CreatedAt: now}
	if hasIP {
		attempt.Ip = &ip
	}
	if err := s.q.InsertLoginAttempt(ctx, attempt); err != nil {
		return nil, err
	}
	if !ok {
		// В журнал — только IP: ни логин, ни пароль не пишем (security.md §4, РСБ).
		log.Warn("security", "event", "login_failed", "ip", ipString(ip, hasIP))
		return nil, platform.InvalidCredentials()
	}

	// 3. Новая сессия. В БД — только SHA-256 токена.
	token, err := newToken()
	if err != nil {
		return nil, err
	}
	if err := s.q.CreateSession(ctx, db.CreateSessionParams{
		TokenHash: hashToken(token), UserID: user.ID, Now: now, ExpiresAt: now.Add(SessionTTL),
	}); err != nil {
		return nil, err
	}
	log.Info("security", "event", "login_success", "user_id", user.ID.String(), "ip", ipString(ip, hasIP))
	return api.Login200JSONResponse{
		Body:    toMe(user),
		Headers: api.Login200ResponseHeaders{SetCookie: sessionCookie(token, int(SessionTTL.Seconds()))},
	}, nil
}

func (s *Server) Logout(ctx context.Context, _ api.LogoutRequestObject) (api.LogoutResponseObject, error) {
	if c, err := platform.RequestFrom(ctx).Cookie(CookieName); err == nil && c.Value != "" {
		if err := s.q.DeleteSession(ctx, hashToken(c.Value)); err != nil {
			return nil, err
		}
		platform.Log(ctx).Info("security", "event", "logout")
	}
	return api.Logout204Response{Headers: api.Logout204ResponseHeaders{SetCookie: sessionCookie("", 0)}}, nil
}

func (s *Server) GetMe(ctx context.Context, _ api.GetMeRequestObject) (api.GetMeResponseObject, error) {
	id, err := platform.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}
	user, err := s.q.GetUserByID(ctx, id.UserID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, platform.Unauthenticated()
	}
	if err != nil {
		return nil, err
	}
	return api.GetMe200JSONResponse(toMe(user)), nil
}

// ---------- Внутренний API: проверка сессии для шлюза (Caddy forward_auth) ----------

func (s *Server) VerifySession(ctx context.Context, req internalapi.VerifySessionRequestObject) (internalapi.VerifySessionResponseObject, error) {
	if req.Params.Sid == nil || *req.Params.Sid == "" {
		return nil, platform.Unauthenticated()
	}
	now := s.now()
	h := hashToken(*req.Params.Sid)
	row, err := s.q.GetActiveSession(ctx, db.GetActiveSessionParams{TokenHash: h, Now: now})
	if errors.Is(err, pgx.ErrNoRows) {
		// Просроченные сессии удаляем при проверке (data-model.md, auth).
		if err := s.q.DeleteExpiredSessions(ctx, now); err != nil {
			return nil, err
		}
		return nil, platform.Unauthenticated()
	}
	if err != nil {
		return nil, err
	}
	if err := s.q.TouchSession(ctx, db.TouchSessionParams{TokenHash: h, Now: now}); err != nil {
		return nil, err
	}
	return verified{platform.Identity{UserID: row.ID, Role: platform.Role(row.Role), FacultyID: row.FacultyID}}, nil
}

// verified — свой тип ответа вместо сгенерированного: генератор делает X-Faculty-Id обязательным,
// а он должен быть только у сотрудника (иначе студенту ушёл бы «нулевой» факультет).
type verified struct{ id platform.Identity }

func (v verified) VisitVerifySessionResponse(w http.ResponseWriter) error {
	platform.SetIdentityHeaders(w.Header(), v.id)
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// ---------- Вспомогательное ----------

func toMe(u db.User) api.Me {
	return api.Me{Id: u.ID, Login: u.Login, Role: api.Role(u.Role), DisplayName: u.DisplayName, FacultyId: u.FacultyID}
}

func newToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("токен: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

func hashToken(token string) []byte {
	sum := sha256.Sum256([]byte(token))
	return sum[:]
}

// sessionCookie: maxAge=0 — удалить cookie. Secure — cookie уходит только по HTTPS.
func sessionCookie(token string, maxAge int) string {
	c := http.Cookie{Name: CookieName, Value: token, Path: "/", MaxAge: maxAge,
		HttpOnly: true, Secure: true, SameSite: http.SameSiteLaxMode}
	if maxAge == 0 {
		c.MaxAge = -1 // в заголовке это Max-Age=0
	}
	return c.String()
}

func ipString(ip netip.Addr, ok bool) string {
	if !ok {
		return ""
	}
	return ip.String()
}

// HashPassword — для cmd/hashpw и тестов.
func HashPassword(password string, cost int) (string, error) {
	h, err := bcrypt.GenerateFromPassword([]byte(password), cost)
	return string(h), err
}

// NewUser — для тестов и seed.
func (s *Server) CreateUser(ctx context.Context, id uuid.UUID, login, password string, role platform.Role, display string, faculty *uuid.UUID) error {
	h, err := HashPassword(password, s.cost)
	if err != nil {
		return err
	}
	return s.q.CreateUser(ctx, db.CreateUserParams{ID: id, Login: login, PasswordHash: h, Role: string(role), DisplayName: display, FacultyID: faculty})
}
