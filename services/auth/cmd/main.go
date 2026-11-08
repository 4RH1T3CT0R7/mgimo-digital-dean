// Сервис auth: вход, сессии, роли, проверка сессии для шлюза.
package main

import (
	"context"
	"log"
	"time"

	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/platform"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/auth/internal/app"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/auth/migrations"
)

func main() {
	platform.HealthcheckFromArgs()
	ctx := context.Background()
	logger := platform.NewLogger("auth")

	pool, err := platform.OpenDB(ctx, platform.MustEnv("DATABASE_URL"))
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()
	if err := platform.Migrate(ctx, pool, migrations.FS); err != nil {
		log.Fatal(err)
	}

	srv, err := app.New(pool, logger, time.Now, app.DefaultBcryptCost)
	if err != nil {
		log.Fatal(err)
	}
	public, internal := srv.Handlers()
	if err := platform.Run("auth", public, internal); err != nil {
		log.Fatal(err)
	}
}
