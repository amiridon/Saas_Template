# SaaS Starter Template (Phase 0)

Clone-and-configure monorepo scaffold with config loader, health endpoints, Docker dev, pre-commit, and CI.

Quickstart

1. Install Node 18+.
2. Copy .env.example to .env and adjust ports.
3. Run: make bootstrap
4. Run: make dev

Services

- apps/api: Express API with GET /health
- apps/web: Minimal static page with GET /health
- apps/worker: Background stub with GET /health

Make targets

- bootstrap: install deps and set up git hooks
- dev: run all services concurrently with hot reload
- lint/test: basic quality gates
