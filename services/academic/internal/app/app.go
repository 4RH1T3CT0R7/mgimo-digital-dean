package app

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/platform"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/academic/internal/db"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/academic/internal/internalapi"
)

// Server реализует внутренний API academic; публичный API добавляется в PR2.
type Server struct {
	q   *db.Queries
	log *slog.Logger
	now func() time.Time
}

var _ internalapi.StrictServerInterface = (*Server)(nil)

func New(pool *pgxpool.Pool, log *slog.Logger, now func() time.Time) *Server {
	return &Server{q: db.New(pool), log: log, now: now}
}

// Handlers разделяет публичный (8080) и внутренний (8081) API.
func (s *Server) Handlers() (public, internal http.Handler) {
	in := internalapi.HandlerWithOptions(internalapi.NewStrictHandlerWithOptions(s, nil, internalapi.StrictHTTPServerOptions{
		RequestErrorHandlerFunc:  platform.RequestErrorHandler,
		ResponseErrorHandlerFunc: platform.ResponseErrorHandler,
	}), internalapi.StdHTTPServerOptions{
		BaseRouter:       platform.NewMux(),
		ErrorHandlerFunc: platform.RequestErrorHandler,
	})

	return platform.Middleware(s.log, platform.NewMux()), platform.Middleware(s.log, in)
}

func (s *Server) GetStudentCard(ctx context.Context, req internalapi.GetStudentCardRequestObject) (internalapi.GetStudentCardResponseObject, error) {
	row, err := s.q.GetStudentCard(ctx, req.StudentId)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, platform.NotFound()
	}
	if err != nil {
		return nil, err
	}

	return internalapi.GetStudentCard200JSONResponse{
		Id:            row.ID,
		FullName:      row.FullName,
		ShortName:     row.ShortName,
		FacultyId:     row.FacultyID,
		FacultyShort:  row.FacultyShort,
		FacultyName:   row.FacultyName,
		ProgramCode:   row.ProgramCode,
		ProgramName:   row.ProgramName,
		Course:        int(row.Course),
		GroupName:     row.GroupName,
		StudentCardNo: row.StudentCardNo,
		StudyForm:     internalapi.StudentCardStudyForm(row.StudyForm),
		Funding:       internalapi.StudentCardFunding(row.Funding),
		StudyLevel:    internalapi.StudentCardStudyLevel(row.StudyLevel),
	}, nil
}

func (s *Server) GetStudentMembership(ctx context.Context, req internalapi.GetStudentMembershipRequestObject) (internalapi.GetStudentMembershipResponseObject, error) {
	row, err := s.q.GetStudentMembership(ctx, req.StudentId)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, platform.NotFound()
	}
	if err != nil {
		return nil, err
	}

	groups, err := s.q.ListStudentGroupIDs(ctx, req.StudentId)
	if err != nil {
		return nil, err
	}

	return internalapi.GetStudentMembership200JSONResponse{
		StudentId: row.ID,
		FacultyId: row.FacultyID,
		Course:    int(row.Course),
		GroupIds:  groups,
	}, nil
}

func (s *Server) GetGroup(ctx context.Context, req internalapi.GetGroupRequestObject) (internalapi.GetGroupResponseObject, error) {
	row, err := s.q.GetGroup(ctx, req.GroupId)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, platform.NotFound()
	}
	if err != nil {
		return nil, err
	}

	return internalapi.GetGroup200JSONResponse{
		Id:        row.ID,
		Name:      row.Name,
		Kind:      internalapi.GroupKind(row.Kind),
		Course:    int(row.Course),
		FacultyId: row.FacultyID,
	}, nil
}

func (s *Server) ResolveAudience(ctx context.Context, req internalapi.ResolveAudienceRequestObject) (internalapi.ResolveAudienceResponseObject, error) {
	if req.Body == nil {
		return nil, platform.Validation(map[string]string{"kind": "Укажите адресата"})
	}
	if err := validateAudience(*req.Body); err != nil {
		return nil, err
	}

	params := db.ResolveAudienceParams{
		Kind:      string(req.Body.Kind),
		FacultyID: req.Body.FacultyId,
		GroupID:   req.Body.GroupId,
		UserID:    req.Body.UserId,
	}
	if req.Body.Kind == internalapi.AudienceKindCourse {
		course := int32(*req.Body.Course)
		params.Course = &course
	}

	rows, err := s.q.ResolveAudience(ctx, params)
	if err != nil {
		return nil, err
	}

	students := make([]internalapi.StudentRef, 0, len(rows))
	for _, row := range rows {
		students = append(students, internalapi.StudentRef{
			Id:        row.ID,
			ShortName: row.ShortName,
			GroupName: row.GroupName,
		})
	}

	return internalapi.ResolveAudience200JSONResponse{Students: students}, nil
}

func validateAudience(a internalapi.Audience) error {
	fields := make(map[string]string)

	switch a.Kind {
	case internalapi.AudienceKindAll:
	case internalapi.AudienceKindFaculty, internalapi.AudienceKindCourse:
		if a.FacultyId == nil || *a.FacultyId == uuid.Nil {
			fields["faculty_id"] = "Укажите факультет"
		}
		if a.Kind == internalapi.AudienceKindCourse && (a.Course == nil || *a.Course < 1 || *a.Course > 6) {
			fields["course"] = "Укажите курс от 1 до 6"
		}
	case internalapi.AudienceKindGroup:
		if a.GroupId == nil || *a.GroupId == uuid.Nil {
			fields["group_id"] = "Укажите группу"
		}
	case internalapi.AudienceKindUser:
		if a.UserId == nil || *a.UserId == uuid.Nil {
			fields["user_id"] = "Укажите студента"
		}
	default:
		fields["kind"] = "Выберите допустимый тип адресата"
	}

	if len(fields) > 0 {
		return platform.Validation(fields)
	}

	return nil
}
