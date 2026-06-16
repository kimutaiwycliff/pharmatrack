# PharmaTrack — self-hosted stack via Docker Compose + dbmate migrations.
# See CLAUDE.md §9. Loads variables from .env if present.

COMPOSE := docker compose -p pharmatrack -f infra/compose.core.yml
DBMATE_IMAGE := ghcr.io/amacneil/dbmate:2
APP_OWNER_PASSWORD ?= app_owner
POSTGRES_DB ?= pharmatrack
# dbmate connects as app_owner (owns objects → migrations bypass RLS).
DBMATE_URL := postgres://app_owner:$(APP_OWNER_PASSWORD)@postgres:5432/$(POSTGRES_DB)?sslmode=disable

.DEFAULT_GOAL := help
.PHONY: help up up-app down logs db-migrate db-rollback db-shell test-rls typecheck lint build clean

help: ## List targets
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-12s\033[0m %s\n",$$1,$$2}'

up: ## Start the data plane (postgres, redis, minio)
	$(COMPOSE) up -d postgres redis minio

up-app: ## Start everything incl. web + worker (after cutover)
	$(COMPOSE) --profile app up -d --build

down: ## Stop all services
	$(COMPOSE) down

logs: ## Follow logs
	$(COMPOSE) logs -f

db-migrate: ## Apply dbmate migrations (as app_owner)
	docker run --rm --network pharmatrack_default \
		-v "$(CURDIR)/infra/migrations:/db/migrations" \
		-e DATABASE_URL="$(DBMATE_URL)" \
		$(DBMATE_IMAGE) --migrations-dir /db/migrations --no-dump-schema up

db-rollback: ## Roll back the last migration
	docker run --rm --network pharmatrack_default \
		-v "$(CURDIR)/infra/migrations:/db/migrations" \
		-e DATABASE_URL="$(DBMATE_URL)" \
		$(DBMATE_IMAGE) --migrations-dir /db/migrations --no-dump-schema down

db-shell: ## psql into the database
	$(COMPOSE) exec postgres psql -U postgres -d $(POSTGRES_DB)

test-rls: ## Run the two-org RLS isolation suite
	pnpm --filter @pharmatrack/db test:rls

typecheck: ## Typecheck all packages
	pnpm -r typecheck || npx tsc --noEmit -p apps/web/tsconfig.json

lint: ## Lint
	pnpm --filter web lint

build: ## Build all
	pnpm build

clean: ## Stop and wipe all data volumes
	$(COMPOSE) down -v
