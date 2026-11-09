package app

import (
	"context"
	"errors"

	"github.com/google/uuid"

	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/events"
)

var replayNamespace = uuid.MustParse("bb3f0a92-a854-4d2f-8bc0-2efea3f14a90")

// ReplaySeedEvents повторяет события изменённых занятий с устойчивыми ID из ID занятия.
func (s *Server) ReplaySeedEvents(ctx context.Context) (published int, err error) {
	if s.bus == nil {
		return 0, errors.New("нет подключения к NATS")
	}
	rows, err := s.q.ListChangedLessonsForReplay(ctx)
	if err != nil {
		return 0, err
	}
	ids := make([]uuid.UUID, 0, len(rows))
	for _, row := range rows {
		ids = append(ids, row.Lesson.ID)
	}
	groups, err := s.lessonGroups(ctx, ids)
	if err != nil {
		return 0, err
	}
	for _, row := range rows {
		lesson := lessonAPI(row.Lesson, row.DisciplineName, row.TeacherShort, groups[row.Lesson.ID])
		event := lessonEvent(lesson, groups[row.Lesson.ID])
		id := uuid.NewSHA1(replayNamespace, row.Lesson.ID[:])
		if err := events.PublishWithID(ctx, s.bus, id, event); err != nil {
			return published, err
		}
		published++
	}

	return published, nil
}
