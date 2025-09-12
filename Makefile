SHELL := /usr/bin/env bash

.PHONY: bootstrap dev test lint e2e db\:migrate db\:reset seed demo

bootstrap:
	@echo "Installing dependencies and setting up git hooks..."
	@npm install
	@npx husky init || true
	@echo "npx lint-staged" > .husky/pre-commit
	@chmod +x .husky/pre-commit

dev:
	@npm run dev

compose:
	@docker compose -f infra/docker/docker-compose.dev.yml up --build

lint:
	@npm run lint

test:
	@npm test

e2e:
	@npm run e2e

demo:
	@echo "Open http://localhost:3000 (web) and http://localhost:4000/health (api)"