package app

import (
	"context"
	"strings"
	"unicode/utf8"

	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/platform"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/academic/internal/api"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/academic/internal/calendar"
)

func (s *Server) GetMyScheduleIcs(ctx context.Context, req api.GetMyScheduleIcsRequestObject) (api.GetMyScheduleIcsResponseObject, error) {
	me, err := platform.RequireStudent(ctx)
	if err != nil {
		return nil, err
	}
	term, err := s.q.GetCurrentTerm(ctx)
	if err != nil {
		return nil, err
	}
	from, to, err := period(req.Params.From, req.Params.To, calendar.Date(s.now()), calendar.Date(term.EndDate.Time), 0)
	if err != nil {
		return nil, err
	}
	schedule, err := s.mySchedule(ctx, me.UserID, from, to, term)
	if err != nil {
		return nil, err
	}

	var body strings.Builder
	line := func(value string) {
		body.WriteString(foldICS(value))
		body.WriteString("\r\n")
	}
	for _, value := range []string{"BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Digital Dean Concept//Schedule//RU",
		"CALSCALE:GREGORIAN", "BEGIN:VTIMEZONE", "TZID:Europe/Moscow", "BEGIN:STANDARD", "DTSTART:19700101T000000",
		"TZOFFSETFROM:+0300", "TZOFFSETTO:+0300", "TZNAME:MSK", "END:STANDARD", "END:VTIMEZONE"} {
		line(value)
	}
	stamp := s.now().UTC().Format("20060102T150405Z")
	for _, lesson := range schedule.Lessons {
		if lesson.Status == api.LessonStatusCancelled || lesson.Status == api.LessonStatusMovedAway {
			continue
		}
		date := lesson.Date.Time.Format("20060102")
		line("BEGIN:VEVENT")
		line("UID:" + lesson.Id.String())
		line("DTSTAMP:" + stamp)
		line("DTSTART;TZID=Europe/Moscow:" + date + "T" + strings.ReplaceAll(lesson.StartTime, ":", "") + "00")
		line("DTEND;TZID=Europe/Moscow:" + date + "T" + strings.ReplaceAll(lesson.EndTime, ":", "") + "00")
		line("SUMMARY:" + escapeICS(lesson.Discipline.Name))
		if location := eventRoom(lesson.Room); location != nil {
			line("LOCATION:" + escapeICS(*location))
		}
		if lesson.Teacher != nil {
			line("DESCRIPTION:" + escapeICS(lesson.Teacher.ShortName))
		}
		line("END:VEVENT")
	}
	line("END:VCALENDAR")
	result := body.String()

	return api.GetMyScheduleIcs200TextcalendarResponse{Body: strings.NewReader(result), ContentLength: int64(len(result)),
		Headers: api.GetMyScheduleIcs200ResponseHeaders{ContentDisposition: `attachment; filename="mgimo-schedule.ics"`}}, nil
}

func escapeICS(value string) string {
	value = strings.ReplaceAll(strings.ReplaceAll(value, "\r\n", "\n"), "\r", "\n")

	return strings.NewReplacer("\\", "\\\\", "\n", "\\n", ";", "\\;", ",", "\\,").Replace(value)
}

// RFC 5545: не более 75 октетов в строке, без разрыва UTF-8 символов.
func foldICS(value string) string {
	var result strings.Builder
	limit := 75
	for len(value) > limit {
		cut := limit
		for !utf8.RuneStart(value[cut]) {
			cut--
		}
		result.WriteString(value[:cut])
		result.WriteString("\r\n ")
		value = value[cut:]
		limit = 74
	}
	result.WriteString(value)

	return result.String()
}
