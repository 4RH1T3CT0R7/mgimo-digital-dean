// Сервис requests: услуги, заявки, переписка, вложения, справки, кабинет сотрудника.
package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/clients/academic"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/events"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/platform"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/requests/internal/app"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/requests/migrations"
)

func main() {
	platform.HealthcheckFromArgs()
	ctx := context.Background()
	logger := platform.NewLogger("requests")

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

	// Адрес сайта (тот же, что у Caddy) — для полного адреса проверки в PDF справки; без него адрес относительный.
	siteURL := ""
	if a := os.Getenv("SITE_ADDRESS"); a != "" {
		siteURL = "https://" + a
	}

	srv := app.New(pool, logger, time.Now, bus, ac, siteURL)

	// -seed-events: опубликовать события по тестовым данным и выйти (T07, deploy/seed.sh)
	if len(os.Args) > 1 && os.Args[1] == "-seed-events" {
		n, err := srv.ReplaySeedEvents(ctx)
		if err != nil {
			log.Fatal(err)
		}
		logger.Info("seed_events", "published", n)
		return
	}
	public, internal := srv.Handlers()
	if err := platform.Run("requests", public, internal); err != nil {
		log.Fatal(err)
	}
}
