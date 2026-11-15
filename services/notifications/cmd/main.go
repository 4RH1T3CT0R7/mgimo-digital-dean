// Сервис notifications: лента, объявления и дедлайны.
package main

import (
	"context"
	"log"
	"net/http"
	"time"

	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/clients/academic"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/events"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/platform"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/notifications/internal/app"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/notifications/migrations"
)

func main() {
	platform.HealthcheckFromArgs()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	logger := platform.NewLogger("notifications")
	pool, err := platform.OpenDB(ctx, platform.MustEnv("DATABASE_URL"))
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()
	if err := platform.Migrate(ctx, pool, migrations.FS); err != nil {
		log.Fatal(err)
	}
	bus, err := events.Connect(ctx, platform.MustEnv("NATS_URL"), logger)
	if err != nil {
		log.Fatal(err)
	}
	defer bus.Close()
	ac, err := academic.NewClientWithResponses(platform.MustEnv("ACADEMIC_INTERNAL_URL"),
		academic.WithHTTPClient(&http.Client{Timeout: 5 * time.Second}))
	if err != nil {
		log.Fatal(err)
	}
	srv := app.New(pool, logger, time.Now, ac)
	stop, err := srv.Subscribe(ctx, bus)
	if err != nil {
		log.Fatal(err)
	}
	defer stop()
	public, internal := srv.Handlers()
	if err := platform.Run("notifications", public, internal); err != nil {
		log.Fatal(err)
	}
}
