import {
  ciUnits,
  parseConfig,
  type UnitDecision,
} from "@sargunv/rubberstamp-core";
import * as v from "valibot";

import { GitHubError, type Pull, type RepoApi } from "./github/client.ts";
import type { PlanJob } from "./jobs/plan.ts";
import type { Store } from "./store.ts";
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
});

export type PlanQuery = v.InferOutput<typeof PlanQuery>;

export type PlanReady = {
  status: "ready";
  /** Whether every unit runs because one rule decided them all. */
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
  store: Pick<Store, "findPlan">;
  enqueue(job: PlanJob): Promise<void>;
  policy: Policy;
  /** Where the dashboard is served. */
  origin: string;
};

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
  let pull: Pull;
  try {
    pull = await repo.pull(query.pull_request);
  } catch (error) {
    if (error instanceof GitHubError && error.status === 404) return NOT_FOUND;
    throw error;
  }

  const repository = pull.base.repo;
  if (!allowed(repository, deps.policy)) return NOT_FOUND;
  // A private repository's plans describe its code, so only someone who can
  // read it may see them. Fork pull requests on public ones get no token.
  if (
    repository.private &&
    (token === null || !(await deps.canRead(token, repository.id)))
  ) {
    return {
      code: 401,
      body: { error: "Pass a token that can read this repository" },
    };
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
  if (ciUnits(parsed.config).length === 0) {
    return everything("no ci units configured");
  }

  const decisions = await deps.store.findPlan(
    repository.id,
    query.pull_request,
    query.sha,
    pull.base.ref,
  );
  if (decisions !== null) {
    return {
      code: 200,
      body: {
        status: "ready",
        all: decisions.every((d) => d.score === null),
        units: decisions.filter((d) => d.run).map((d) => d.unit),
        decisions,
        url,
      },
    };
  }
  // An old run of a push that a newer one replaced; only the head is planned.
  if (pull.head.sha !== query.sha) {
    return everything("a newer push superseded this commit");
  }
  if (query.start) {
    await deps.enqueue({
      type: "plan",
      installationId: installation.id,
      repoId: repository.id,
      repo: repository.full_name,
      number: query.pull_request,
      head: query.sha,
      base: pull.base.ref,
    });
  }
  return {
    code: 202,
    body: { status: "pending", retryAfter: RETRY_AFTER_SECONDS, url },
  };
}
