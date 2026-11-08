// Сервис notifications: лента, объявления, дедлайны. Заглушка каркаса (T01); логика — в T06.
package main

import (
	"log"

	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/platform"
)

func main() {
	platform.HealthcheckFromArgs()
	if err := platform.Run("notifications", platform.HealthOnlyMux(), platform.HealthOnlyMux()); err != nil {
		log.Fatal(err)
	}
}
