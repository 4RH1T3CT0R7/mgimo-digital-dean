// Сервис academic: профиль, расписание, оценки. Заглушка каркаса (T01); логика — в T04.
package main

import (
	"log"

	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/platform"
)

func main() {
	platform.HealthcheckFromArgs()
	if err := platform.Run("academic", platform.HealthOnlyMux(), platform.HealthOnlyMux()); err != nil {
		log.Fatal(err)
	}
}
