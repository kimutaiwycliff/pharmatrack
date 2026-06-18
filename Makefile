# PharmaTrack — self-hosted stack via Docker Compose + dbmate migrations.
# See CLAUDE.md §9. Loads variables from .env if present.

COMPOSE := docker compose -p pharmatrack -f infra/compose.core.yml
DBMATE_IMAGE := ghcr.io/amacneil/dbmate:2
APP_OWNER_PASSWORD ?= app_owner
POSTGRES_DB ?= pharmatrack
# dbmate connects as app_owner (owns objects → migrations bypass RLS).
DBMATE_URL := postgres://app_owner:$(APP_OWNER_PASSWORD)@postgres:5432/$(POSTGRES_DB)?sslmode=disable

STANDALONE := apps/web/.next/standalone/apps/web

.DEFAULT_GOAL := help
.PHONY: help up up-app up-prod down logs db-migrate db-rollback db-shell test-rls typecheck lint build build-web start-web clean

help: ## List targets
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-12s\033[0m %s\n",$$1,$$2}'

up: ## Start the data plane (postgres, redis, minio)
	$(COMPOSE) up -d postgres redis minio

# --env-file makes root .env the interpolation source so NEXT_PUBLIC_* build args
# are inlined into the browser bundle. Without it Compose looks beside the compose
# file (infra/) and the args resolve blank. Both targets need .env to run anyway.
up-app: ## Local mirror: build + start web + worker (http://localhost:3000, no TLS)
	$(COMPOSE) --env-file .env --profile app up -d --build

up-prod: ## Production: build + start web + worker behind Caddy (TLS for $$APP_DOMAIN)
	$(COMPOSE) --env-file .env --profile app --profile edge up -d --build

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

build-web: ## Production build of the web app (Next standalone output)
	NODE_OPTIONS=--max-old-space-size=4096 pnpm --filter web build

start-web: ## Run the production standalone server locally (assembles assets, loads .env)
	@test -f $(STANDALONE)/server.js || { echo "No standalone build — run 'make build-web' first"; exit 1; }
	@mkdir -p $(STANDALONE)/.next
	rm -rf $(STANDALONE)/.next/static && cp -r apps/web/.next/static $(STANDALONE)/.next/static
	@[ -d apps/web/public ] && { rm -rf $(STANDALONE)/public && cp -r apps/web/public $(STANDALONE)/public; } || true
	set -a; [ -f .env ] && . ./.env; set +a; node $(STANDALONE)/server.js

clean: ## Stop and wipe all data volumes
	$(COMPOSE) down -v
