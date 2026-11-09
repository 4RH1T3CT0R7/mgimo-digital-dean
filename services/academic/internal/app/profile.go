package app

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"

	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/platform"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/academic/internal/api"
)

func (s *Server) GetMyProfile(ctx context.Context, _ api.GetMyProfileRequestObject) (api.GetMyProfileResponseObject, error) {
	me, err := platform.RequireStudent(ctx)
	if err != nil {
		return nil, err
	}
	row, err := s.q.GetMyProfile(ctx, me.UserID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, platform.NotFound()
	}
	if err != nil {
		return nil, err
	}
	languages, err := s.q.ListMyLanguageGroups(ctx, me.UserID)
	if err != nil {
		return nil, err
	}

	student := row.Student
	profile := api.Profile{
		Id: student.ID, FullName: student.FullName, ShortName: student.ShortName,
		Faculty: api.Faculty{Id: student.FacultyID, Name: row.FacultyName, ShortName: row.FacultyShort},
		Group:   api.GroupRef{Id: student.AcademicGroupID, Name: row.GroupName},
		Course:  int(student.Course), StudentCardNo: student.StudentCardNo,
		StudyForm: api.ProfileStudyForm(student.StudyForm), Funding: api.ProfileFunding(student.Funding),
		StudyLevel: api.ProfileStudyLevel(student.StudyLevel), EnrollmentYear: int(student.EnrollmentYear),
		Status: api.ProfileStatus(student.Status), LanguageGroups: make([]api.LanguageGroupRef, 0, len(languages)),
	}
	profile.Program.Code = row.ProgramCode
	profile.Program.Name = row.ProgramName
	for _, group := range languages {
		language := ""
		if group.Language != nil {
			language = *group.Language
		}
		profile.LanguageGroups = append(profile.LanguageGroups, api.LanguageGroupRef{Id: group.ID, Name: group.Name, Language: language})
	}

	return api.GetMyProfile200JSONResponse(profile), nil
}

func (s *Server) ListFaculties(ctx context.Context, _ api.ListFacultiesRequestObject) (api.ListFacultiesResponseObject, error) {
	if _, err := platform.RequireAuth(ctx); err != nil {
		return nil, err
	}
	rows, err := s.q.ListFaculties(ctx)
	if err != nil {
		return nil, err
	}
	faculties := make(api.ListFaculties200JSONResponse, 0, len(rows))
	for _, row := range rows {
		faculties = append(faculties, api.Faculty{Id: row.ID, Name: row.Name, ShortName: row.ShortName})
	}

	return faculties, nil
}

func (s *Server) ListStaffGroups(ctx context.Context, req api.ListStaffGroupsRequestObject) (api.ListStaffGroupsResponseObject, error) {
	me, err := platform.RequireStaffOrAdmin(ctx)
	if err != nil {
		return nil, err
	}
	scope := me.FacultyScope()
	if me.Role == platform.RoleAdmin {
		scope = req.Params.FacultyId
	}
	rows, err := s.q.ListStaffGroups(ctx, scope)
	if err != nil {
		return nil, err
	}
	groups := make(api.ListStaffGroups200JSONResponse, 0, len(rows))
	for _, row := range rows {
		groups = append(groups, api.GroupInfo{Id: row.ID, Name: row.Name, Kind: api.GroupInfoKind(row.Kind),
			Course: int(row.Course), FacultyShort: row.FacultyShort})
	}

	return groups, nil
}

func notFound(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return platform.NotFound()
	}

	return err
}

// appendZero и newLike позволяют заполнить анонимные поля сгенерированных типов,
// не дублируя структуры контрактов вручную.
func appendZero[T any](s []T) []T {
	var value T

	return append(s, value)
}

func newLike[T any](_ *T) *T {
	return new(T)
}

func emptySlice[T any](s []T) []T {
	if s == nil {
		return make([]T, 0)
	}

	return s
}

func intPointer(v *int32) *int {
	if v == nil {
		return nil
	}
	result := int(*v)

	return &result
}
