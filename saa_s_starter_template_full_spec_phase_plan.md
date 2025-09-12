# SaaS Starter Template – Full Spec & Phase Plan

A production‑grade, **clone‑and‑configure** boilerplate you can drop into a new repo and ship SaaS ideas fast. This spec is designed to be stack‑agnostic while giving concrete implementation guidance. It emphasizes:

- **Config-first design** (12‑factor), environment‑driven behavior, and provider adapters.
- **Testability** (unit, integration, e2e) from Day 0.
- **Multi-tenant core** with orgs/teams, RBAC, and Stripe-like billing.
- **Clean, responsive UI** with a lightweight design system.
- **Admin observability**: metrics, funnels, feature flags, job queue, webhooks.

> Use this document as your blueprint when scaffolding with GitHub Copilot. Each phase ends with a demo script and acceptance tests.

---

## 1) Goals & Non‑Goals

### Goals
- Ship a reusable **SaaS chassis** you can clone, rename, and configure in minutes.
- Support **multiple data stores** via adapters (e.g., Postgres/MySQL/SQL Server/SQLite) and a uniform ORM layer.
- First‑class **billing/subscriptions** (Stripe primary), easily swappable.
- High‑quality **DX**: scripts, seeds, fixtures, CI/CD, local dev via Docker.
- **Observability** & **admin** views (MRR, conversion funnel, DAU/MAU, churn, jobs, webhooks, audit logs).

### Non‑Goals
- No domain‑specific business modules (leave room for your product features).
- Not a CMS. Include basic marketing/blog/docs scaffolding only.

---

## 2) High‑Level Architecture

### Monorepo Layout (reference)
```
saas-starter/
  apps/
    web/            # Marketing site + App shell (SSG/SSR capable)
    api/            # HTTP/GraphQL API (REST + Webhooks)
    worker/         # Background jobs (billing, emails, analytics ETL)
  packages/
    db/             # ORM models, migrations, RLS policies, seeders
    core/           # Domain logic (auth, billing, tenancy, RBAC)
    ui/             # Design system, components, themes, icons
    analytics/      # Tracking SDK (server & client), event schemas
    testing/        # Test utils, fixtures, e2e helpers
  infra/
    docker/         # Dockerfiles, docker-compose.*.yml
    terraform/      # Optional IaC modules for cloud providers
    k8s/            # Optional helm chart & manifests
  .github/workflows # CI pipelines
  Makefile          # Common tasks (fmt, lint, test, db:reset)
```

### Service Boundaries
- **web**: SSG/SSR marketing + app UI. Talks to **api** and reads public feature flags.
- **api**: stateless app server (auth, orgs, billing, CRUD, webhook endpoints).
- **worker**: async jobs (email, invoices, dunning, analytics ETL, scheduled tasks).

### Ports & Adapters
- **DB Port** with adapters: Postgres | MySQL | SQL Server | SQLite (dev).
- **Cache Port**: Redis (recommended) | in‑memory (dev/test only).
- **Billing Port**: Stripe (default) | mock.
- **Email Port**: SMTP | SendGrid | SES | mock.
- **AI Port**: OpenAI | mock.
- **File Storage Port**: S3‑compatible | local disk (dev).

### Configuration Model
- 12‑factor `.env` with **typed config loader** (JSON Schema validation) and per‑env overrides. Single **`CONFIG_VERSION`** to gate migrations.

---

## 3) Core Domain & Data Model

### Multi‑Tenant Entities
- **users**: id, email, password_hash (nullable if SSO only), name, image_url, 2FA_secret (nullable), created_at.
- **organizations**: id, slug, name, owner_user_id, plan_tier, created_at.
- **memberships**: id, org_id, user_id, role (Owner/Admin/Member/Billing/Support), status.
- **sessions**: id, user_id, refresh_token_hash, expires_at, ip, ua, created_at.

### Billing & Monetization
- **products**: id, name, description.
- **plans**: id, product_id, nickname, interval (month/year), price_cents, currency, metered (bool), features_json.
- **subscriptions**: id, org_id, plan_id, provider (stripe), provider_sub_id, status, trial_end, current_period_end.
- **invoices**: id, org_id, provider_invoice_id, amount_cents, status, issued_at, paid_at.
- **usage_records** (optional): id, org_id, metric_key, quantity, period_start, period_end.

### Platform Observability
- **events**: id, actor_type (user/org/system), actor_id, name, properties_json, ts.
- **page_views**: id, session_id, path, referrer, utm_json, ts.
- **audit_logs**: id, org_id, user_id, action, target, before_json, after_json, ts.
- **webhooks**: id, source (stripe), type, payload_json, processed_at, status.
- **jobs**: id, type, payload_json, status, attempts, last_error, run_at.

### Product Enablement
- **feature_flags**: key, kind (bool|rollout|variant), rules_json, enabled.
- **experiments**: key, variants_json, status.
- **api_keys**: id, org_id, hash, name, scopes, last_used_at.

> **RLS** (Row Level Security) recommended if using Postgres. Otherwise enforce tenant scoping in data access layer. All tenant data MUST carry `org_id` and queries must filter by it.

---

## 4) Authentication & Authorization

- **Auth methods**: Email+password (with magic link), OAuth (Google/Microsoft), optional SSO (OIDC). Mandatory email verification.
- **Session model**: httpOnly, sameSite=strict cookies + refresh token rotation; short‑lived access tokens for APIs.
- **2FA**: TOTP optional per user.
- **RBAC**: Roles: Owner, Admin, Member, Billing, Support.
- **Permissions** (examples):
  - Owner: all org actions.
  - Admin: manage members, flags, projects.
  - Billing: view/change plan, payment methods.
  - Support: impersonation (read‑only unless toggled).
  - Member: standard app usage.

---

## 5) Billing (Stripe‑first)

- **Plan catalog** stored locally (plans table) and mirrored in Stripe for pricing.
- **Checkout**: Stripe Checkout Session w/ org context + `success_url`/`cancel_url`.
- **Webhooks**: `checkout.session.completed`, `customer.subscription.updated/deleted`, `invoice.paid/failed`.
- **Dunning**: worker retries, email notices, grace periods.
- **Trials**: configurable at plan level; auto‑downgrade on expiration.
- **Entitlements**: gate features via `entitlements(org)` function reading plan features + flags.

---

## 6) UX & Design System

### Principles
- **Responsive first** (mobile → desktop).
- **Simple typography scale** (e.g., 12/14/16/20/24/32/48).
- **8‑pt spacing grid**; consistent radii and shadows.
- **Light/Dark** themes; system preference default.
- **Accessible**: WCAG AA minimum (color contrast, focus states, keyboardability).

### Component Inventory
- Primitives: Button, Input, Textarea, Select, Switch, Checkbox, Radio, Tooltip, Modal, Drawer, Toast/Snackbar, Tabs, Breadcrumbs, Pagination, DataTable, EmptyState, Skeleton.
- Layout: TopNav, SideNav, AppShell, Footer, MarketingHeader, PricingCard, Testimonial, FAQ, CodeBlock (for docs), FeatureGrid.

### Required Pages
- **Marketing**: Home (hero, social proof, features, CTA), Pricing (monthly/yearly, FAQs), About, Blog (optional), Docs (getting started), Legal (Terms/Privacy/Cookies), Contact.
- **Auth**: Sign up, Sign in, Magic Link, OAuth callback, 2FA setup, Forgot/Reset.
- **App**: Dashboard (quick stats, onboarding checklist), Projects/Objects (placeholder), Search, Notifications.
- **Settings**: Profile, Security (password/2FA), Organization (name, slug), Members, Roles, Billing (plan, payment methods, invoices), API Keys, Feature Flags (user‑visible toggles).
- **Admin**: Dashboard (see §7), Users/Orgs, Subscriptions, Funnels, Feature Flags (system), Experiments, Jobs, Webhooks, Audit Logs, Impersonation.

---

## 7) Admin Analytics & Observability

### KPIs
- **Revenue**: MRR, ARR, ARPU, LTV (cohort‑based), Stripe balance.
- **Acquisition/Funnel**: Visitors → Signups → Trials → Converted (rates + absolute counts, by channel/utm).
- **Engagement**: DAU/WAU/MAU, retention curves, feature usage.
- **Churn**: logo churn %, net MRR churn %, reasons (survey), expansion vs contraction.
- **Operations**: webhook success rate, job queue depth, error budgets, p95 latency.

### Source of Truth
- **events/page_views** tables populated by:
  - Client: small analytics snippet posting to `/collect`.
  - Server: emit events on key milestones (signup, checkout, first value, invite, cancellation).
- **ETL**: nightly job creates materialized views (e.g., `mv_mrr`, `mv_funnel_day`).

### Admin Screens
- Dashboard cards + sparklines; date pickers and compare‑to‑previous.
- Funnel visualization; cohort charts.
- Click to drill into org/user; impersonate.
- Webhook inspector (payloads, retries); Job explorer (status, retry, dead letter).

---

## 8) Security & Compliance

- Secure headers, CSRF protection, rate limiting, IP throttling.
- Input validation (server & client) via shared schema.
- Password hashing (argon2/bcrypt), 2FA, session rotation.
- Secrets in env/secret manager; never in repo.
- Per‑tenant isolation; prevent IDORs by scoping every query by `org_id`.
- Data export/delete endpoints (GDPR/CCPA), audit trails.
- PII minimization; encryption at rest (DB & object storage) where supported.

---

## 9) Testing Strategy

### Test Pyramid
- **Unit**: pure functions (auth, entitlements, pricing math, validators).
- **Integration**: DB + API (auth flows, org membership, billing webhooks with Stripe mock, email sending).
- **E2E**: Browser tests (signup → verify → create org → invite → subscribe → cancel). Run against ephemeral test env and seeded DB.

### Fixtures & Mocks
- Deterministic seeders for users/orgs/plans.
- Test doubles for Stripe/OpenAI/Email; record/replay (VCR) optional.

### Gatekeepers
- 100% tests must pass before merge to `main`.
- Code coverage thresholds (e.g., 85%+ statements/branches core packages).

---

## 10) DevEx & Tooling

- **Makefile** (or package scripts) targets: `bootstrap`, `dev`, `test`, `e2e`, `db:migrate`, `db:reset`, `seed`, `lint`, `typecheck`, `release`, `demo`.
- **Conventional Commits** + **changesets** (or semantic‑release) for versioning.
- **Pre-commit** hooks: format, lint, secrets scan.
- **Scaffolder CLI**: `bin/new-module` to create a feature slice (API routes, UI page, tests, docs stub).

---

## 11) CI/CD Blueprint (GitHub Actions)

**Workflows**
1) `ci.yml`
   - Matrix jobs over DB providers (sqlite, postgres, mysql) for core tests.
   - Steps: checkout → setup toolchain → cache deps → lint/typecheck → unit/integration → e2e (against docker‑compose services) → artifacts (screenshots, coverage).
2) `release.yml`
   - On tag: build images, publish to registry, push docs site, create GitHub Release.
3) `deploy.yml` (optional)
   - Environment‑based deployments (staging/main). Promote with approvals.

**Secrets**: managed per‑env; dev uses `.env.local`, CI uses GitHub Secrets.

---

## 12) Local Development

- `docker-compose.dev.yml` spins up DB (select provider), Redis, mailcatcher, stripe-mock, web, api, worker.
- `make dev` → hot reload on all services.
- `make db:reset seed` → reproducible data.

---

## 13) Configuration & Environment Variables

Create a single **`/config/schema.json`** and loader in `packages/core/config`.

**Required** (examples):
- `APP_ENV` (development|test|staging|production)
- `APP_URL`, `APP_DOMAIN`
- `DB_PROVIDER` (postgres|mysql|sqlserver|sqlite)
- `DB_URL`
- `CACHE_URL` (redis://...)
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `EMAIL_PROVIDER` + `EMAIL_FROM`
- `OPENAI_API_KEY` (optional per‑product)
- `STORAGE_PROVIDER` + `STORAGE_BUCKET`
- `SESSION_SECRET`
- `ENCRYPTION_KEY` (for at‑rest field encryption)
- `ANALYTICS_SAMPLING` (0..1)

Fail fast on missing/invalid config.

---

## 14) Phase Plan (Each Phase is Demoable & Testable)

### Phase 0 — Bootstrap & Scaffolding (1–2 days)
**Deliverables**: monorepo skeleton, config loader, Makefile, docker‑compose, health endpoints, pre‑commit.
**Tests**: CI runs lint + unit placeholder; `GET /health` returns 200.
**Demo**: `make dev` shows web landing stub and API health.

### Phase 1 — Database & ORM (1–2 days)
**Deliverables**: DB adapters, migrations for core tables, seeders, RLS policies (if Postgres).
**Tests**: CRUD smoke tests; tenancy constraint tests.
**Demo**: run seeds; list seeded orgs via admin endpoint.

### Phase 2 — AuthN/Z (2–3 days)
**Deliverables**: Signup, login, email verify, password reset, OAuth provider, sessions, RBAC enforcement.
**Tests**: integration for auth flows; e2e browser test for signup→verify→login.
**Demo**: live signup, invite a teammate; role‑gated route works.

### Phase 3 — Org & Settings (1–2 days)
**Deliverables**: Org CRUD, member invites, roles UI, profile/security pages, API keys.
**Tests**: invite flow; API key auth to protected endpoint.
**Demo**: create org, invite, rotate API key.

### Phase 4 — Billing (3–4 days)
**Deliverables**: Pricing page, checkout, webhooks, invoices, trials, cancellation & proration, entitlements.
**Tests**: stripe‑mock integration, webhook idempotency, downgrade/upgrade.
**Demo**: subscribe, see invoice, switch plan, cancel.

### Phase 5 — Marketing Site (1–2 days)
**Deliverables**: Home hero, features, pricing, FAQ, legal pages, blog/docs scaffolding.
**Tests**: lighthouse budget (performance ≥90, a11y ≥90), links & sitemap.
**Demo**: deploy static site, navigate pricing → checkout.

### Phase 6 — Admin & Analytics (3–5 days)
**Deliverables**: Admin dashboard KPIs, funnel, DAU/MAU charts, webhook & job viewers, impersonation, audit log.
**Tests**: analytics ETL unit + integration; e2e admin access control.
**Demo**: show MRR sample, funnel from seeded events, retry a failed webhook.

### Phase 7 — Emails & Notifications (1–2 days)
**Deliverables**: transactional emails (verify, reset, invite, dunning), templates, in‑app toasts.
**Tests**: snapshot tests for templates; email preview server in dev.
**Demo**: trigger emails from flows.

### Phase 8 — Feature Flags & Experiments (1–2 days)
**Deliverables**: server + client SDKs, flag rules, experiment assignment, exposure events.
**Tests**: deterministic bucketing; variant distribution.
**Demo**: toggle a feature live; run a simple A/B on CTA copy.

### Phase 9 — Hardening & Perf (ongoing)
**Deliverables**: rate limiting, security headers, caching, n+1 guards, slow query log, p95 SLIs.
**Tests**: k6 load test profile; security scans.
**Demo**: show 10x traffic scenario still green.

### Phase 10 — Template Packaging (1 day)
**Deliverables**: `bin/clone-and-rename` script (rebrand, env skeleton), README quickstart, issue templates, PR templates.
**Tests**: script succeeds, CI green on fresh clone.
**Demo**: create a brand‑new repo from template and boot.

---

## 15) Admin Dashboard: Widgets & Queries

- **Revenue**: MRR/ARR (sum of active subscriptions by plan × price), ARPU (MRR / active orgs).
- **Funnel**: day‑level counts: page_views→signups→trials→paid; compute stage conversion and total conversion.
- **Engagement**: DAU/WAU/MAU via last‑activity event per user.
- **Churn**: count cancelled subs this period / starting subs.
- **Traffic**: sessions by source/utm, bounce rate (single page_view sessions).
- **Ops**: webhook success %, last 24h job failures, p95 API latency.

Materialize as DB views for fast charts; refresh on schedule or on write.

---

## 16) Accessibility & Internationalization

- All interactive elements keyboard navigable; visible focus; ARIA where needed.
- Color contrast AA; media prefers‑reduced‑motion support.
- i18n keys ready; English default, JSON catalogs per locale.

---

## 17) New Project Quickstart (Clone → Configure → Run)

1. **Clone** the template repo.
2. Run `bin/clone-and-rename YourProductName` (updates names, slugs, package IDs).
3. Copy `.env.example` to `.env` (all services) and fill secrets.
4. `make bootstrap` → installs deps, generates types, verifies toolchains.
5. `make db:migrate seed` → creates schema and seed data (plans, admin user).
6. `make dev` → web at `http://localhost:3000`, API at `:4000`.
7. Log in as seeded admin; visit **Admin → Settings** to confirm environment.

---

## 18) Acceptance Test Matrix (Essentials)

| Area | Scenario | Checks |
|---|---|---|
| Auth | Signup → Verify → Login | Emails sent, tokens one‑time use, session cookie set, redirect to dashboard |
| Org | Create org, invite member, assign role | Invite email, acceptance, role gating |
| Billing | Checkout → Paid → Upgrade → Cancel | Webhooks processed, invoices stored, entitlements updated |
| API Keys | Create + use key | Scope enforced, revocation immediate |
| Admin | Impersonate org, view KPIs, retry webhook | Audit log written, results refresh |
| Analytics | Visitor → Signup funnel | Counters increment, chart reflects window |
| Security | Rate limit, CSRF, IDOR | 429 on abuse, CSRF tokens required, cross‑org access denied |
| E2E | “Happy path” to first value | Time‑to‑value under target, onboarding checklist updated |

---

## 19) Appendix A — Example Event Schema

```json
{
  "name": "checkout_completed",
  "actor_type": "org",
  "actor_id": "org_123",
  "properties": {
    "plan_id": "pro_monthly",
    "amount_cents": 2900,
    "currency": "USD",
    "utm": {"source": "twitter", "campaign": "launch"}
  },
  "ts": "2025-01-01T12:00:00Z"
}
```

---

## 20) Appendix B — Feature Flag Rule (Example)

```json
{
  "key": "new_pricing_banner",
  "kind": "rollout",
  "rules": [
    { "if": {"org.plan": "free"}, "percentage": 50 },
    { "if": {"org.plan": "pro"}, "percentage": 10 }
  ],
  "enabled": true
}
```

---

## 21) Appendix C — Permission Matrix (Excerpt)

| Capability | Owner | Admin | Member | Billing | Support |
|---|---|---|---|---|---|
| Manage org settings | ✓ | ✓ |  |  |  |
| Invite/remove users | ✓ | ✓ |  |  |  |
| View/change plan | ✓ |  |  | ✓ |  |
| Impersonate users | ✓ | ✓(guarded) |  |  | ✓(read‑only) |
| Access feature flags | ✓ | ✓ |  |  |  |

---

## 22) Notes for GitHub Copilot Prompts

- “Create data models and migrations for users, organizations, memberships, sessions with multi‑tenant `org_id` scoping and indices. Include soft‑delete and timestamps.”
- “Implement typed config loader validated by JSON Schema; fail fast on missing secrets.”
- “Add Stripe checkout + webhooks; write idempotent handlers updating subscriptions and invoices; include tests with stripe‑mock.”
- “Build Admin dashboard with MRR, funnel, DAU/MAU using materialized views; add charts and date filters.”
- “Implement feature flag SDK server+client with deterministic hashing and exposure events; include tests.”

---

### Done Right, This Gives You:
- A **repeatable, testable** foundation for any SaaS idea.
- **One‑command local dev**, **one‑click deploy**, and **observable** production.
- A professional **marketing → signup → pay → value** path and an **admin cockpit** to steer growth.

