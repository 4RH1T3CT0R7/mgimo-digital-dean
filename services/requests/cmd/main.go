// Сервис requests: услуги, заявки, справки. Заглушка каркаса (T01); логика — в T05.
package main

import (
	"log"

	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/platform"
)

func main() {
	platform.HealthcheckFromArgs()
	if err := platform.Run("requests", platform.HealthOnlyMux(), platform.HealthOnlyMux()); err != nil {
		log.Fatal(err)
	}
}
