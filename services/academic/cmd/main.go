// Сервис academic: профиль, расписание, оценки.
package main

import (
	"context"
	"log"
	"os"
	"time"

	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/events"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/platform"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/academic/internal/app"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/academic/migrations"
)

func main() {
	platform.HealthcheckFromArgs()
	ctx := context.Background()
	logger := platform.NewLogger("academic")

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

	srv := app.New(pool, logger, time.Now, bus)
	if len(os.Args) > 1 && os.Args[1] == "-seed-events" {
		n, err := srv.ReplaySeedEvents(ctx)
		if err != nil {
			log.Fatal(err)
		}
		logger.Info("seed_events", "published", n)

		return
	}
	public, internal := srv.Handlers()
	if err := platform.Run("academic", public, internal); err != nil {
		log.Fatal(err)
	}
}
