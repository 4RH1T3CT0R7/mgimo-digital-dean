// Сервис assistant: ИИ-помощник «Спроси деканат» (T25) и база знаний из документов деканата (D66).
package main

import (
	"context"
	"log"
	"os"
	"time"

	"github.com/4RH1T3CT0R7/mgimo-digital-dean/pkg/platform"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/assistant/internal/app"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/assistant/internal/faq"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/assistant/internal/llm"
	"github.com/4RH1T3CT0R7/mgimo-digital-dean/services/assistant/migrations"
)

func main() {
	platform.HealthcheckFromArgs()
	ctx := context.Background()
	logger := platform.NewLogger("assistant")
	pool, err := platform.OpenDB(ctx, platform.MustEnv("DATABASE_URL"))
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()
	if err := platform.Migrate(ctx, pool, migrations.FS); err != nil {
		log.Fatal(err)
	}

	// Справочник — content/faq.md (T19). Пока его нет, помощник работает и предлагает «Вопрос в деканат».
	path := os.Getenv("FAQ_PATH")
	if path == "" {
		path = "/content/faq.md"
	}
	var entries []faq.Entry
	if data, err := os.ReadFile(path); err == nil {
		entries = faq.Parse(string(data))
	} else {
		logger.Warn("faq_missing", "path", path)
	}
	logger.Info("faq_loaded", "entries", len(entries))

	// Без ключа LLM — ответы из базы знаний и справочника как есть (D16).
	client := llm.New(os.Getenv("LLM_BASE_URL"), os.Getenv("LLM_API_KEY"), os.Getenv("LLM_AUTH_SCHEME"),
		os.Getenv("LLM_MODEL"), 10*time.Second)
	logger.Info("llm", "enabled", client != nil)

	srv := app.New(pool, entries, client, logger, time.Now)
	public, internal := srv.Handlers()
	if err := platform.Run("assistant", public, internal); err != nil {
		log.Fatal(err)
	}
}
