# Design

Docket is a GitHub App. Onboarding a repository means installing the app and
adding `.github/docket.yml`. Nothing else lives in the repository except, for CI
selection, one action step and the `if:` conditions on gated jobs.

It grew out of the Python scripts in `maplibre/maplibre-native-ffi`
(`ci/label.py`, `ci/select.py`, and their evals). Those needed a TypeSafe API
key in every repository's secrets, so fork pull requests ran without selection,
and every repository needed its own copy of the machinery.

## Configuration

```yaml
# .github/docket.yml
context: |
  What this repository is, for every judgment.

labels:
  context: Extra context for labeling only. # optional
  groups:
    kind: { pick: one, required: true, labels: [bug, feature, perf, chore] }
    area: { required: true, labels: ["area:*"] }
    binding:
      labels: ["binding:*"]
      rule: Only when the work is specific to this binding.
      threshold: 0.8 # optional; tuned in the UI
  describe: # only where GitHub's 100-character description isn't enough
    area:upstream: A patch carried under `patches/`, or a submodule bump.
```

- A label's meaning is its GitHub description unless `describe` overrides it.
- `pick: one` asks one Choice over the group's labels; a group that isn't
  `required` also gets a "none of these" option. `pick: any` (the default) asks
  one Noul per label.
- A group gets labels only when it has none, so a label that a template, a bot,
  or a person set always wins. A `required` group gets its most likely label
  when none passes the threshold.
- Default thresholds are 0.5 for `pick: one` and 0.8 for `pick: any`.

## Labels

Webhook `issues.opened` or `pull_request.opened` enqueues a job. The job reads
the config and labels on the default branch, builds the state from the issue or
the pull request's files and patches (GitHub's three-dot diff), asks Jev, reads
the labels again, and adds what the decision rules pick. It needs no git and no
workflow step.

Every run stores its state in R2 and its answers in D1, keyed by state hash,
question hash, and answering model. Every `labeled` and `unlabeled` event is
recorded, so a person correcting docket's labels produces a backtest case.

## CI selection (planned)

The app computes plans from the GitHub API alone:

- The pull request's own changes since a unit last passed come from an
  interdiff: compare the pull request's per-file patches now (`base...head`)
  against its patches at the last pass (`base_then...lastPassHead`), normalized
  to their +/- lines. Main's merged changes don't move them, and it survives
  rebases and force pushes. Oversized compares run every unit.
- Job outcomes come from `workflow_job` webhooks, mapped to units by job name
  globs in the config, so history needs no Actions API scanning.
- A first-party action posts `{repo, pr, sha}` and long-polls for the plan, with
  no credentials: the server derives everything from GitHub data and
  default-branch config. Timeout or error means every unit runs.
- The app posts the single required check itself, from the plan and the job
  outcomes, in place of a generated aggregate job.

```yaml
ci:
  context: Linux x64 runs every binding's tests; others catch platform risk.
  baseline: linux-x64
  units:
    linux-x64: { covers: …, jobs: ["target-linux-gnu-x64-*"] }
    docs: { covers: …, jobs: [docs], paths: ["docs/**"], standalone: true }
```

## Backtesting (planned)

Goal: tuning in seconds. Jev costs $0.042 per million input tokens, so a full
label rerun of ~100 cases is about $0.06; the limits are latency and the
TypeSafe organization's tokens-per-second rate limit.

1. States are built once, on install and as items arrive, and stored in R2.
   Tuning never touches git or GitHub.
2. Answers are cached per question, not per config, so editing one label's
   meaning re-asks only that question. Questions in one request can't see each
   other, so this is sound. The cache misses when `jev-latest` moves, which is
   correctness, not pinning.
3. Threshold changes run the decision rules from `packages/core` in the browser
   over cached probabilities: no inference.
4. Text edits fan out only the changed questions from a per-repository Durable
   Object, streaming answers over a WebSocket; a newer edit cancels the older
   run.
5. A fast tier of ~30 informative cases (near the threshold, or currently wrong)
   returns first; the full corpus fills in behind it.

Ground truth: labels people applied, corrections to docket's labels, and for CI,
units that failed on main after the pull request's plan skipped them. Cases live
in D1. Maintainers mark `must` and `ok` in the UI.

## Limits

Public repositories are free; private ones need their owner on the allowlist.
Each installation has a daily Jev token budget. Over budget, docket adds no
labels and plans every unit.

## Stack

TypeScript throughout. Cloudflare Workers with Hono, Queues, D1, R2, and Durable
Objects. The web UI is React with TanStack Router and Query, tRPC, Tailwind, and
Base UI, served from the same Worker. Served at `docket.sargunv.dev`.
