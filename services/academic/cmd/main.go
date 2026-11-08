// Сервис academic: профиль, расписание, оценки.
package main

import (
	"context"
	"log"
	"time"

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

	srv := app.New(pool, logger, time.Now)
	public, internal := srv.Handlers()
	if err := platform.Run("academic", public, internal); err != nil {
		log.Fatal(err)
	}
}
