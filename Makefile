# PharmaTrack — local, fully-dockerized dev/test stack.
#
# After cloning, the whole thing comes up with one command:
#
#     make up
#
# That boots a dockerized Supabase backend (Supabase CLI's local stack — same
# Postgres/Auth/Storage/Kong containers), applies all migrations (incl. the
# Kenyan drug catalog, no demo data), writes .env, then builds and runs the
# PRODUCTION app image + Redis as containers on http://localhost:3000.
#
# Requirements: Docker + Docker Compose v2, and Node (for the Supabase CLI via
# npx). Override the CLI with `make SUPABASE="supabase" up` if installed natively.

SUPABASE ?= npx --yes supabase
COMPOSE  ?= docker compose
APP      := $(COMPOSE) -f docker-compose.yml -f docker-compose.local.yml

.DEFAULT_GOAL := help

.PHONY: help doctor up backend env app down stop logs ps migrate rebuild clean open

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | \
		awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

doctor: ## Check prerequisites (docker, compose v2, node)
	@command -v docker >/dev/null || { echo "✗ Docker not found"; exit 1; }
	@$(COMPOSE) version >/dev/null 2>&1 || { echo "✗ docker compose v2 not found"; exit 1; }
	@command -v node >/dev/null || { echo "✗ Node not found"; exit 1; }
	@echo "✓ docker, compose, node present"

backend: ## Start the dockerized Supabase backend + apply migrations
	$(SUPABASE) start

env: ## Write root .env from the running backend (keeps keys in sync)
	@$(SUPABASE) status -o env | node scripts/gen-local-env.mjs

app: ## Build + run the production app image + redis (host network)
	$(APP) up -d --build web redis

up: doctor backend env app ## Bring the whole local stack up (one command)
	@echo ""
	@echo "  PharmaTrack is up — open http://localhost:3000 (first load → /setup)"
	@echo "  Supabase Studio: http://localhost:54323"
	@echo "  Invite emails:   http://localhost:54324  (Inbucket)"
	@echo ""

down: ## Stop the app + redis (leaves the backend running)
	$(APP) down

stop: ## Stop everything (app + backend), keep data
	-$(APP) down
	-$(SUPABASE) stop

logs: ## Tail the app container logs
	$(APP) logs -f web

ps: ## Show app containers
	$(APP) ps

migrate: ## Apply any new migrations to the running backend
	$(SUPABASE) migration up

rebuild: ## Rebuild the app image and restart it
	$(APP) up -d --build web

clean: ## Stop everything and WIPE local data (fresh start)
	-$(APP) down -v
	-$(SUPABASE) stop --no-backup
	@echo "✓ Stopped and wiped local data."

open: ## Open the app in a browser
	@xdg-open http://localhost:3000 >/dev/null 2>&1 || true
