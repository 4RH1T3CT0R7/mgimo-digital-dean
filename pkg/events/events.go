// Package events — типизированные события между сервисами через NATS JetStream (D24).
// Контракт событий — docs/contracts/events.md. Руками JSON событий не собирается (AGENTS.md, правило 4).
//
// Публикация:  events.Publish(ctx, bus, events.LessonChanged{...})
// Подписка:    events.Subscribe(ctx, bus, "notifications", func(ctx context.Context, e events.Envelope[events.LessonChanged]) error {...})
package events

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
)

const (
	StreamName = "EVENTS"

	SubjectLessonChanged            = "academic.lesson.changed"
	SubjectApplicationStatusChanged = "requests.application.status_changed"
	SubjectApplicationMessageAdded  = "requests.application.message_added"
)

var moscow = time.FixedZone("Europe/Moscow", 3*60*60)

// Event — данные события; Subject связывает тип с subject в NATS.
type Event interface {
	Subject() string
}

// Envelope — конверт события (events.md, «Конверт»).
type Envelope[T Event] struct {
	ID         uuid.UUID `json:"id"`
	Type       string    `json:"type"`
	OccurredAt time.Time `json:"occurred_at"`
	Data       T         `json:"data"`
}

// ---------- Каталог событий (events.md) ----------

// LessonSlot — время и место занятия; Room — «Главный корпус, 3047» или nil.
type LessonSlot struct {
	Date      string  `json:"date"`       // YYYY-MM-DD
	StartTime string  `json:"start_time"` // HH:MM
	EndTime   string  `json:"end_time"`   // HH:MM
	Room      *string `json:"room"`
}

// LessonChanged — academic.lesson.changed.
type LessonChanged struct {
	LessonID       uuid.UUID   `json:"lesson_id"`
	FacultyID      uuid.UUID   `json:"faculty_id"`
	GroupIDs       []uuid.UUID `json:"group_ids"`
	DisciplineName string      `json:"discipline_name"`
	ChangeType     string      `json:"change_type"` // moved | cancelled | room_changed
	Previous       LessonSlot  `json:"previous"`
	Current        LessonSlot  `json:"current"` // для cancelled равно Previous
	Reason         *string     `json:"reason"`
}

func (LessonChanged) Subject() string { return SubjectLessonChanged }

// ApplicationStatusChanged — requests.application.status_changed.
type ApplicationStatusChanged struct {
	ApplicationID uuid.UUID `json:"application_id"`
	Number        string    `json:"number"`
	StudentID     uuid.UUID `json:"student_id"`
	FacultyID     uuid.UUID `json:"faculty_id"`
	ServiceTypeID string    `json:"service_type_id"`
	ServiceTitle  string    `json:"service_title"`
	OldStatus     *string   `json:"old_status"` // nil — заявка только создана
	NewStatus     string    `json:"new_status"`
	Comment       *string   `json:"comment"`
}

func (ApplicationStatusChanged) Subject() string { return SubjectApplicationStatusChanged }

// ApplicationMessageAdded — requests.application.message_added.
type ApplicationMessageAdded struct {
	ApplicationID uuid.UUID `json:"application_id"`
	Number        string    `json:"number"`
	StudentID     uuid.UUID `json:"student_id"`
	ServiceTypeID string    `json:"service_type_id"`
	ServiceTitle  string    `json:"service_title"`
	AuthorRole    string    `json:"author_role"` // student | staff
	AuthorLabel   string    `json:"author_label"`
}

func (ApplicationMessageAdded) Subject() string { return SubjectApplicationMessageAdded }

// ---------- Шина ----------

// Bus — подключение к NATS JetStream.
type Bus struct {
	nc  *nats.Conn
	js  jetstream.JetStream
	log *slog.Logger
	// RetryDelay — пауза перед повторной доставкой после ошибки обработчика (в тестах уменьшается).
	RetryDelay time.Duration
	now        func() time.Time
}

// Connect подключается к NATS и создаёт (или обновляет) stream EVENTS.
func Connect(ctx context.Context, url string, log *slog.Logger) (*Bus, error) {
	nc, err := nats.Connect(url, nats.Name("mgimo"), nats.MaxReconnects(-1))
	if err != nil {
		return nil, fmt.Errorf("nats: %w", err)
	}
	js, err := jetstream.New(nc)
	if err != nil {
		nc.Close()
		return nil, fmt.Errorf("jetstream: %w", err)
	}
	b := &Bus{nc: nc, js: js, log: log, RetryDelay: 5 * time.Second, now: time.Now}
	if err := b.ensureStream(ctx); err != nil {
		nc.Close()
		return nil, err
	}
	return b, nil
}

func (b *Bus) Close() { b.nc.Close() }

func (b *Bus) ensureStream(ctx context.Context) error {
	_, err := b.js.CreateOrUpdateStream(ctx, jetstream.StreamConfig{
		Name:       StreamName,
		Subjects:   []string{"academic.>", "requests.>"},
		Storage:    jetstream.FileStorage,
		MaxAge:     7 * 24 * time.Hour,
		Duplicates: 2 * time.Minute, // окно дедупликации по Nats-Msg-Id
	})
	if err != nil {
		return fmt.Errorf("stream %s: %w", StreamName, err)
	}
	return nil
}

// Publish публикует событие с новым ID. Вызывать ПОСЛЕ успешного коммита транзакции (events.md).
func Publish[T Event](ctx context.Context, b *Bus, data T) error {
	return PublishWithID(ctx, b, uuid.New(), data)
}

// PublishWithID — с заданным ID: повтор с тем же ID в окне дедупликации не доставляется второй раз.
func PublishWithID[T Event](ctx context.Context, b *Bus, id uuid.UUID, data T) error {
	env := Envelope[T]{ID: id, Type: data.Subject(), OccurredAt: b.now().In(moscow), Data: data}
	payload, err := json.Marshal(env)
	if err != nil {
		return err
	}
	if _, err := b.js.Publish(ctx, data.Subject(), payload, jetstream.WithMsgID(id.String())); err != nil {
		return fmt.Errorf("публикация %s: %w", data.Subject(), err)
	}
	return nil
}

// Handler обрабатывает событие. Ошибка → повторная доставка (до 5 раз), поэтому обработчик обязан быть идемпотентным.
type Handler[T Event] func(ctx context.Context, e Envelope[T]) error

// Subscribe создаёт durable-подписку service на событие типа T. Несколько копий сервиса с одним service
// читают как одна группа: каждое событие обрабатывается один раз. Возвращает функцию остановки.
func Subscribe[T Event](ctx context.Context, b *Bus, service string, h Handler[T]) (stop func(), err error) {
	var zero T
	subject := zero.Subject()
	durable := service + "-" + strings.NewReplacer(".", "-", ">", "all", "*", "any").Replace(subject)
	cons, err := b.js.CreateOrUpdateConsumer(ctx, StreamName, jetstream.ConsumerConfig{
		Durable:       durable,
		FilterSubject: subject,
		AckPolicy:     jetstream.AckExplicitPolicy,
		MaxDeliver:    5,
		AckWait:       30 * time.Second,
	})
	if err != nil {
		return nil, fmt.Errorf("подписка %s: %w", durable, err)
	}
	cc, err := cons.Consume(func(msg jetstream.Msg) {
		var env Envelope[T]
		if err := json.Unmarshal(msg.Data(), &env); err != nil {
			b.log.Error("event_bad_payload", "subject", subject, "error", err.Error())
			_ = msg.Term() // битое сообщение повторять бессмысленно
			return
		}
		if err := safeHandle(ctx, h, env); err != nil {
			b.log.Warn("event_handler_error", "subject", subject, "event_id", env.ID.String(), "error", err.Error())
			_ = msg.NakWithDelay(b.RetryDelay)
			return
		}
		_ = msg.Ack()
	})
	if err != nil {
		return nil, fmt.Errorf("подписка %s: %w", durable, err)
	}
	return cc.Stop, nil
}

func safeHandle[T Event](ctx context.Context, h Handler[T], env Envelope[T]) (err error) {
	defer func() {
		if p := recover(); p != nil {
			err = errors.New(fmt.Sprint("panic: ", p))
		}
	}()
	return h(ctx, env)
}
