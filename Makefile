# На Windows: winget install ezwinports.make (или scoop install make); запускать из Git Bash.
COMPOSE := docker compose -f deploy/docker-compose.yml --env-file .env
CONTRACTS := auth.yaml academic.yaml requests.yaml notifications.yaml assistant.yaml internal/auth.yaml internal/academic.yaml
SQLC_IMAGE := sqlc/sqlc:1.28.0

.PHONY: gen gen-go gen-sqlc gen-frontend lint-contracts test lint up down logs seed e2e

gen: gen-sqlc gen-go gen-frontend ## Весь код из контрактов и SQL

gen-go:
	go generate ./...

# sqlc — через Docker: на Windows у него проблемы с cgo. Конфиг ищется в services/*/sqlc.yaml.
gen-sqlc:
	@for f in services/*/sqlc.yaml; do \
		[ -f "$$f" ] || continue; \
		echo "sqlc: $$f"; \
		docker run --rm -v "$(CURDIR):/src" -w /src $(SQLC_IMAGE) generate -f "$$f" || exit 1; \
	done

gen-frontend:
	@if [ -f frontend/package.json ]; then cd frontend && npm run gen; fi

lint-contracts:
	cd docs/contracts && npx --yes @redocly/cli@1.34.5 lint $(CONTRACTS)

test:
	go test ./...

lint:
	go vet ./...

up: ## Поднять всё локально (нужен .env)
	$(COMPOSE) up -d --build

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f --tail=100

seed: ## Тестовые данные всех сервисов (нужен запущенный стек)
	bash deploy/seed.sh

e2e: ## e2e-сценарий жюри — появится в T20
	@if [ -f e2e/package.json ]; then cd e2e && npm run e2e; else echo "e2e: появится в T20"; fi
