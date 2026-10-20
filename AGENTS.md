# Rubberstamp

A GitHub App for code-review-adjacent automation, starting with Jev-based issue
and pull request labeling, then CI coverage selection. Free for open source;
private repositories only on an allowlist. Runs on Cloudflare Workers.

## Project map

```
packages/core   pure TS shared by the worker and the web UI: config schema,
                question building, decisions, state description, Jev client
apps/worker     Cloudflare Worker: GitHub webhooks, queue consumer, jobs,
                D1 store (migrations/), R2 state snapshots
docs/design.md  the product design and the decisions behind it
```

## Dev tool commands

- `mise run verify`: formatting, lint, type checks, and tests. Must pass before
  a change merges.
- `mise run test`: unit tests only.
- `mise run fix`: apply formatters and auto-fixable lint.
- `mise run worker:dev`: run the Worker locally against local D1, R2, and
  Queues. Put secrets in `apps/worker/.dev.vars` (gitignored).
- `mise run worker:types`: regenerate binding types after editing
  `apps/worker/wrangler.jsonc`.

## Project invariants

- Configuration lives in each repository at `.github/rubberstamp.yml` and is
  read from the default branch only. A pull request can never change how it is
  judged.
- Rubberstamp builds every Jev state and question itself from GitHub data and
  that configuration. Nothing a caller sends becomes a question.
- Decision logic in `packages/core` stays pure and runtime-agnostic so the web
  UI can re-run it over cached answers without inference.
- Answers are cached per (state hash, question hash, answering model version).
- Every degraded path is safe: over budget or on error, add no labels and run
  every CI unit.
