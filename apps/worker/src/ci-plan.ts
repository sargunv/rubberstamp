import {
  ciConfigHash,
  ciUnits,
  parseConfig,
  type UnitDecision,
} from "@sargunv/rubberstamp-core";
import * as v from "valibot";

import { GitHubError, type Pull, type RepoApi } from "./github/client.ts";
import type { PlanJob } from "./jobs/plan.ts";
import type { PlanKey, Store } from "./store.ts";
import { allowed, type Policy } from "./webhooks.ts";

/** How long a workflow waits before asking again for a pending plan. */
export const RETRY_AFTER_SECONDS = 10;

/** A workflow asking for the plan for one push to a pull request. */
export const PlanQuery = v.object({
  // Only names GitHub allows, so the name can't walk out of its API path.
  repository: v.pipe(
    v.string(),
    v.regex(/^[A-Za-z0-9-]+\/(?!\.\.?$)[A-Za-z0-9._-]+$/),
  ),
  pull_request: v.pipe(v.number(), v.integer(), v.minValue(1)),
  /** The pull request's head, not the merge commit a workflow checks out. */
  sha: v.pipe(
    v.string(),
    v.regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i),
    v.toLowerCase(),
  ),
  /** Queue a plan if none exists yet, as a webhook would have. */
  start: v.optional(v.boolean(), false),
  /**
   * The workflow run asking, so its outcome can say which units passed. Older
   * versions of the action don't send it.
   */
  run_id: v.optional(v.pipe(v.number(), v.safeInteger(), v.minValue(1))),
  run_attempt: v.optional(v.pipe(v.number(), v.safeInteger(), v.minValue(1))),
});

export type PlanQuery = v.InferOutput<typeof PlanQuery>;

export type PlanReady = {
  status: "ready";
  /** Whether every unit runs because rules decided them all without scores. */
  all: boolean;
  /** The ids of the units that run. */
  units: string[];
  decisions: UnitDecision[];
  /** Why everything runs without a plan, when there is none. */
  reason?: string;
  /** The repository's dashboard. */
  url: string;
};

export type PlanPending = {
  status: "pending";
  retryAfter: number;
  url: string;
};

export type PlanReply =
  | { code: 200; body: PlanReady }
  | { code: 202; body: PlanPending }
  | { code: 401 | 404; body: { error: string } };

export type PlanQueryDeps = {
  installationFor(fullName: string): Promise<{ id: number } | null>;
  repo(installationId: number, fullName: string): RepoApi;
  canRead(token: string, repoId: number): Promise<boolean>;
  store: Pick<Store, "findPlan" | "claim" | "release" | "saveRun">;
  enqueue(job: PlanJob): Promise<void>;
  policy: Policy;
  /** Where the dashboard is served. */
  origin: string;
  now?: () => Date;
};

/**
 * How long after a run starts its units can still be recorded. A full re-run
 * keeps the workflow file of its first attempt but would be judged under
 * today's config, so an old run could credit units it never knew about.
 */
const MAX_RUN_AGE_MS = 24 * 60 * 60_000;

/**
 * Whether the run a caller names really is a pull_request run of this
 * repository's configured workflow at the head it asked about, started
 * recently. The endpoint is public, so a caller could otherwise tie another
 * workflow's success, or one that ran the base branch's code, to this pull
 * request's units.
 */
async function runAsked(
  repo: RepoApi,
  repoId: number,
  runId: number,
  workflow: string,
  query: PlanQuery,
  now: Date,
): Promise<boolean> {
  try {
    const run = await repo.workflowRun(runId);
    return (
      run !== null &&
      run.repository.id === repoId &&
      run.event === "pull_request" &&
      // GitHub can suffix the ref the file came from, as in `ci.yml@main`.
      run.path.split("@")[0] === workflow &&
      run.head_sha.toLowerCase() === query.sha &&
      now.getTime() - Date.parse(run.created_at) <= MAX_RUN_AGE_MS
    );
  } catch (error) {
    // Recording only saves later CI time, so it never fails the plan.
    console.error(`${query.repository} run ${runId}`, error);
    return false;
  }
}

const NOT_FOUND = {
  code: 404,
  body: { error: "Rubberstamp doesn't serve this pull request" },
} as const;

/**
 * The plan for a pull request's head, for a workflow to gate its jobs on.
 * Anything that leaves no plan to follow answers with every unit running.
 */
export async function ciPlan(
  query: PlanQuery,
  token: string | null,
  deps: PlanQueryDeps,
): Promise<PlanReply> {
  const installation = await deps.installationFor(query.repository);
  if (!installation) return NOT_FOUND;
  const repo = deps.repo(installation.id, query.repository);
  const repository = await repo.repository();
  if (!allowed(repository, deps.policy)) return NOT_FOUND;
  // A private repository's plans describe its code, so only someone who can
  // read it may see them, or even learn which of its pull requests exist.
  // Fork pull requests on public ones get no token.
  if (
    repository.private &&
    (token === null || !(await deps.canRead(token, repository.id)))
  ) {
    return {
      code: 401,
      body: { error: "Pass a token that can read this repository" },
    };
  }
  let pull: Pull;
  try {
    pull = await repo.pull(query.pull_request);
  } catch (error) {
    if (error instanceof GitHubError && error.status === 404) return NOT_FOUND;
    throw error;
  }

  const url = `${deps.origin}/${repository.full_name}`;
  const everything = (reason: string): PlanReply => ({
    code: 200,
    body: { status: "ready", all: true, units: [], decisions: [], reason, url },
  });
  const file = await repo.config();
  if (file === null) return everything("no config");
  const parsed = parseConfig(file.source);
  if (!parsed.ok) return everything("invalid config");
  const configured = ciUnits(parsed.config).map((unit) => unit.id);
  if (configured.length === 0) return everything("no ci units configured");

  // The units the asking run will execute, so its outcome can say they passed
  // at this head. Only answers it acts on are recorded, never pending ones.
  // Without the workflow that gates jobs on units, any other pull_request
  // workflow's success could stand in for it, so nothing is recorded.
  const workflow = parsed.config.ci?.workflow;
  const record = async (units: string[], base: string) => {
    if (query.run_id === undefined || query.run_attempt === undefined) return;
    if (workflow === undefined) return;
    const now = deps.now?.() ?? new Date();
    const asked = await runAsked(
      repo,
      repository.id,
      query.run_id,
      workflow,
      query,
      now,
    );
    if (!asked) return;
    await deps.store.saveRun({
      installationId: installation.id,
      repoId: repository.id,
      runId: query.run_id,
      attempt: query.run_attempt,
      number: query.pull_request,
      head: query.sha,
      base,
      units,
      workflow,
    });
  };

  const key: PlanKey = {
    repoId: repository.id,
    number: query.pull_request,
    head: query.sha,
    baseRef: pull.base.ref,
    config: await ciConfigHash(parsed.config),
  };
  const plan = await deps.store.findPlan(key);
  if (plan !== null) {
    const { decisions } = plan;
    // A unit that passed already is decided without a score but doesn't run.
    const all = decisions.every((d) => d.run && d.score === null);
    const units = decisions.filter((d) => d.run).map((d) => d.unit);
    await record(all ? configured : units, plan.base);
    return {
      code: 200,
      body: { status: "ready", all, units, decisions, url },
    };
  }
  // An old run of a push that a newer one replaced; only the head is planned.
  if (pull.head.sha !== query.sha) {
    await record(configured, pull.base.sha);
    return everything("a newer push superseded this commit");
  }
  // Webhooks plan only open pull requests, and nothing gates a closed one's CI.
  if (pull.state !== "open") {
    await record(configured, pull.base.sha);
    return everything("the pull request isn't open");
  }
  // Anyone can ask, as often as they like, so only the first ask in a lease
  // queues a plan. The claim lapses rather than being released, unless the
  // plan never made it into the queue.
  const request = {
    kind: "request",
    repoId: key.repoId,
    number: key.number,
    key: `${key.head} ${key.baseRef} ${key.config}`,
  } as const;
  const owner = crypto.randomUUID();
  if (query.start && (await deps.store.claim(request, owner))) {
    try {
      await deps.enqueue({
        type: "plan",
        installationId: installation.id,
        repoId: repository.id,
        repo: repository.full_name,
        number: query.pull_request,
        head: query.sha,
        base: pull.base.ref,
      });
    } catch (error) {
      await deps.store.release(request, owner);
      throw error;
    }
  }
  return {
    code: 202,
    body: { status: "pending", retryAfter: RETRY_AFTER_SECONDS, url },
  };
}
