# Rubberstamp

A GitHub App for code-review-adjacent automation, starting with Jev-based issue
and pull request labeling, then CI coverage selection. Free for open source;
private repositories only on an allowlist. Runs on Cloudflare Workers.

## Project map

```
packages/core   pure TS shared by the worker and the web UI: config schema,
                question building, decisions, state description, Jev client
apps/worker     Cloudflare Worker: GitHub webhooks, queue consumer, jobs,
                D1 store (migrations/), daily cleanup, the dashboard's API
                and sign-in, and per-repo preview Durable Objects. It also
                serves apps/web's build as static assets.
apps/web        The dashboard: React, TanStack Router (file-based routes in
                src/routes) and TanStack Query, Tailwind, and Base UI. Route
                loaders only fill the Query cache; components read from it.
README.md       a short introduction for people discovering the project
```

## Dev tool commands

- `mise run verify`: formatting, lint, type checks, and tests. Must pass before
  a change merges.
- `mise run test`: unit tests only.
- `mise run fix`: apply formatters and auto-fixable lint.
- `mise run dev`: run the Worker (port 8787) and the dashboard (port 5199)
  together, with secrets from fnox. Open http://localhost:5199.
- `mise run worker:dev`: run the Worker locally against local D1, Durable
  Objects, and Queues. It writes `apps/worker/.dev.vars` (gitignored) from fnox
  each run.
- `mise run deploy`: create missing queues, migrate D1, and deploy the Worker
  with its secrets from fnox, using the Cloudflare token there too. Wrangler
  creates the D1 database itself and finds it by name afterward. CI runs this on
  every push to main after verify passes, so deploy by hand only to ship
  something main doesn't have.
- `mise run worker:types`: regenerate binding types after editing
  `apps/worker/wrangler.jsonc`.

## Secrets

Secrets live age-encrypted in `fnox.toml`. Read one with `fnox get NAME`, and
add or replace one with `fnox set NAME` (it reads stdin or prompts). Never print
a secret's value. Secrets marked `env = false`, such as the Cloudflare token,
stay out of the Worker. They're encrypted to you and to CI's deploy key, whose
private half is the `FNOX_AGE_KEY` secret in the repository's `production`
environment.

Planned work lives in GitHub issues on `sargunv/rubberstamp`. Rubberstamp labels
them itself from `.config/rubberstamp.yml`, so don't label by hand.

## Web UI

- `apps/web/src/ui` is the design system: layout, controls, and styles with no
  product content. `apps/web/src/components` builds Rubberstamp's features from
  it, and routes compose those.
- The root route renders `AppShell` with the header and footer once, for loaded
  pages, the first load, and errors alike. Pages never render the header.
- Every page renders `Page`. A page and its loading state render the same frame
  component (`RepoFrame`, `AccountFrame`), so they can't lay out differently.
  Loading shows `PendingBar` and what's already known, never guessed content.
- Style with theme tokens (`text-drop`, `rounded-sm`, `shadow-popup`), not raw
  values or CSS variables. A component's `className` sets layout, such as
  margins and width; its appearance comes from its variant. Add a variant rather
  than overriding colors or borders.

## Project invariants

- Configuration lives in each repository at `.config/rubberstamp.yml` and is
  read from the default branch only.
- Rubberstamp builds every Jev state and question itself from GitHub data and
  that configuration. Nothing a caller sends becomes a question.
- Decision logic in `packages/core` stays pure and runtime-agnostic so the web
  UI can re-run it over cached answers without inference.
- Tuning caches answers per (state hash, question hash, answering model
  version). Live labeling keeps only its decisions, never states or answers.
- Spend nothing on a repository until someone uses it there: a repository
  without configuration stores nothing, and tuning data is built on demand and
  expires.
- Every degraded path is safe: over budget or on error, add no labels and run
  every CI unit.
