import {
  changedPaths,
  ciUnits,
  decideUnits,
  everyUnit,
  parseConfig,
  planRequests,
  unitScores,
  type Config,
  type Response,
  type Unit,
  type UnitDecision,
} from "@sargunv/rubberstamp-core";

import { budgetPeriod, budgetSpent } from "../budget.ts";
import type { Pull } from "../github/client.ts";
import type { LabelDeps } from "./label.ts";

export type PlanJob = {
  type: "plan";
  installationId: number;
  repoId: number;
  repo: string;
  number: number;
  /** The head the push left the pull request at. */
  head: string;
};

export type PlanDeps = LabelDeps;

export type PlanOutcome =
  | { status: "skipped"; reason: string; warnings?: string[] }
  | { status: "planned"; decisions: UnitDecision[] };

type Judged = {
  decisions: UnitDecision[];
  model: string | null;
  inputTokens: number;
};

export async function runPlanJob(
  job: PlanJob,
  deps: PlanDeps,
): Promise<PlanOutcome> {
  const { repo, store } = deps;
  if (await store.hasPlan(job.repoId, job.number, job.head)) {
    return { status: "skipped", reason: "already planned" };
  }
  const file = await repo.config();
  if (file === null) return { status: "skipped", reason: "no config" };
  const parsed = parseConfig(file.source);
  if (!parsed.ok) {
    return {
      status: "skipped",
      reason: "invalid config",
      warnings: parsed.errors,
    };
  }
  const units = ciUnits(parsed.config);
  if (units.length === 0) return { status: "skipped", reason: "ci disabled" };

  const pull = await repo.pull(job.number);
  // A later push queued its own plan, and the files now show that push.
  if (pull.head.sha !== job.head) {
    return { status: "skipped", reason: "superseded" };
  }

  const judged = await judge(job, deps, pull, units, parsed.config);
  await store.savePlan({
    installationId: job.installationId,
    repoId: job.repoId,
    repo: job.repo,
    number: job.number,
    title: pull.title,
    head: pull.head.sha,
    base: pull.base.sha,
    ...judged,
  });
  return { status: "planned", decisions: judged.decisions };
}

/** Ask Jev about the change, or plan every unit when it can't or shouldn't. */
async function judge(
  job: PlanJob,
  deps: PlanDeps,
  pull: Pull,
  units: Unit[],
  config: Config,
): Promise<Judged> {
  const every = (rule: string): Judged => ({
    decisions: everyUnit(units, rule),
    model: null,
    inputTokens: 0,
  });
  const period = budgetPeriod(deps.now?.() ?? new Date());
  const spent = await budgetSpent(
    deps.store,
    job.installationId,
    period,
    deps.budget,
  );
  if (spent) return every(spent);

  const files = await deps.repo.pullFiles(job.number);
  const requests =
    files.length < pull.changed_files
      ? null
      : planRequests(
          config,
          units,
          { title: pull.title, body: pull.body, files },
          deps.model,
        );
  if (requests === null) return every("too large to judge");

  const responses: Response[] = [];
  try {
    for (const request of requests) {
      const response = await deps.ask(request);
      await deps.store.addUsage(
        job.installationId,
        period,
        job.repo,
        "ci",
        response.usage.input_tokens,
      );
      responses.push(response);
    }
  } catch (error) {
    // Selection only saves CI time, so any failure runs everything.
    console.error(`${job.repo}#${job.number} selection failed`, error);
    return every("selection failed");
  }
  const scores = unitScores(
    units,
    responses.map((r) => r.answers),
  );
  return {
    decisions: decideUnits(units, scores, changedPaths(files)),
    model: responses[0]?.model ?? null,
    inputTokens: responses.reduce((sum, r) => sum + r.usage.input_tokens, 0),
  };
}
