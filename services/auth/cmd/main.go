// Сервис auth: вход, сессии, роли. Заглушка каркаса (T01); логика — в T02.
package main

import (
	"log"
	"net/http"

	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/platform"
)

func main() {
	platform.HealthcheckFromArgs()

	internal := platform.HealthOnlyMux()
	// Пока сессий нет — любая проверка от шлюза отклоняется (T02 заменит реальной логикой).
	internal.HandleFunc("GET /internal/verify", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"code":"unauthenticated","message":"Войдите в систему"}`))
	})

	if err := platform.Run("auth", platform.HealthOnlyMux(), internal); err != nil {
		log.Fatal(err)
	}
}
