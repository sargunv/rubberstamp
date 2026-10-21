import {
  changedPaths,
  changedSince,
  ciConfigHash,
  ciUnits,
  decideUnits,
  everyUnit,
  noUnit,
  parseConfig,
  planRequests,
  unitScores,
  type Config,
  type PullFile,
  type Response,
  type Unit,
  type UnitDecision,
} from "@sargunv/rubberstamp-core";

import { budgetPeriod, budgetSpent } from "../budget.ts";
import type { Pull } from "../github/client.ts";
import type { PlanKey, UnitPass } from "../store.ts";
import { claimed } from "./claim.ts";
import type { LabelDeps } from "./label.ts";

export type PlanJob = {
  type: "plan";
  installationId: number;
  repoId: number;
  repo: string;
  number: number;
  /** The head the push left the pull request at. */
  head: string;
  /** The branch the pull request would merge into. */
  base: string;
};

export type PlanDeps = LabelDeps;

export type PlanOutcome =
  | { status: "skipped"; reason: string; warnings?: string[] }
  /** Another job holds the claim; try again once it lapses. */
  | { status: "busy" }
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
  const key: PlanKey = {
    repoId: job.repoId,
    number: job.number,
    head: job.head,
    baseRef: job.base,
    config: await ciConfigHash(parsed.config),
  };
  if ((await store.findPlan(key)) !== null) {
    return { status: "skipped", reason: "already planned" };
  }

  // A later push or retarget queued its own plan. The files show whatever the
  // pull request is now, so it must be the same before and after reading them.
  const current = async () => {
    const pull = await repo.pull(job.number);
    return pull.head.sha === job.head && pull.base.ref === job.base
      ? pull
      : null;
  };
  const pull = await current();
  if (!pull) return { status: "skipped", reason: "superseded" };
  const files = await repo.pullFiles(job.number);
  if (!(await current())) return { status: "skipped", reason: "superseded" };

  const outcome = await claimed(
    store,
    {
      kind: "plan",
      repoId: job.repoId,
      number: job.number,
      key: `${job.head} ${job.base} ${key.config}`,
    },
    async (): Promise<PlanOutcome> => {
      const judged = await judge(job, deps, pull, files, units, parsed.config);
      // Judging can take a while, and a plan for a head the pull request has
      // left would show as its latest.
      if (!(await current())) {
        return { status: "skipped", reason: "superseded" };
      }
      await store.savePlan({
        installationId: job.installationId,
        repoId: job.repoId,
        repo: job.repo,
        number: job.number,
        title: pull.title,
        head: pull.head.sha,
        baseRef: pull.base.ref,
        base: pull.base.sha,
        config: key.config,
        ...judged,
      });
      return { status: "planned", decisions: judged.decisions };
    },
  );
  return outcome ?? { status: "busy" };
}

// GitHub's compare lists at most 300 files, so a list that long may be cut.
const COMPARE_FILE_LIMIT = 300;

/**
 * Units Jev judges together: on the whole change, or on what changed since
 * the commit where they last passed.
 */
type Judgment = { units: Unit[]; files: PullFile[]; since?: string };

/** Ask Jev about the change, or plan every unit when it can't or shouldn't. */
async function judge(
  job: PlanJob,
  deps: PlanDeps,
  pull: Pull,
  files: PullFile[],
  units: Unit[],
  config: Config,
): Promise<Judged> {
  const decided = new Map<string, UnitDecision>();
  const decide = (decisions: UnitDecision[]) => {
    for (const decision of decisions) decided.set(decision.unit, decision);
  };
  // Only the configured workflow's successes are passes, and a workflow the
  // config named before may not gate the same jobs.
  const workflow = config.ci?.workflow;
  const passes =
    workflow === undefined
      ? new Map<string, UnitPass>()
      : await deps.store.lastPasses(job.repoId, job.number, workflow);
  const judgments = await sincePasses(
    job,
    deps,
    pull,
    files,
    units,
    passes,
    decide,
  );

  const responses: Response[] = [];
  const period = budgetPeriod(deps.now?.() ?? new Date());
  // Why the judgments not yet asked about run every unit, once one has.
  let stopped: string | null = null;
  for (const { units, files: changed, since } of judgments) {
    const requests =
      stopped !== null || files.length < pull.changed_files
        ? null
        : planRequests(
            config,
            units,
            {
              title: pull.title,
              body: pull.body,
              files: changed,
              ...(since === undefined ? {} : { since }),
            },
            deps.model,
          );
    if (requests === null) {
      decide(everyUnit(units, stopped ?? "too large to judge"));
      continue;
    }
    const answers: Response["answers"][] = [];
    try {
      for (const request of requests) {
        stopped = await budgetSpent(
          deps.store,
          job.installationId,
          period,
          deps.budget,
        );
        if (stopped !== null) break;
        const response = await deps.ask(request);
        await deps.store.addUsage(
          job.installationId,
          period,
          job.repo,
          "ci",
          response.usage.input_tokens,
        );
        responses.push(response);
        answers.push(response.answers);
      }
    } catch (error) {
      // Selection only saves CI time, so any failure runs everything.
      console.error(`${job.repo}#${job.number} selection failed`, error);
      stopped = "selection failed";
    }
    if (stopped !== null) {
      decide(everyUnit(units, stopped));
      continue;
    }
    const scores = unitScores(units, answers);
    decide(
      scores === null
        ? everyUnit(units, "selection failed")
        : decideUnits(units, scores, changedPaths(changed), since),
    );
  }

  return {
    decisions: units.flatMap((unit) => decided.get(unit.id) ?? []),
    // A fallback after some chunks were answered still records what they spent.
    model: responses[0]?.model ?? null,
    inputTokens: responses.reduce((sum, r) => sum + r.usage.input_tokens, 0),
  };
}

/**
 * Decide the units whose last pass leaves nothing to judge, and group the rest
 * by what Jev should judge them on: what changed since their pass, or the
 * whole change for units that never passed or whose pass can't be compared.
 */
async function sincePasses(
  job: PlanJob,
  deps: PlanDeps,
  pull: Pull,
  files: PullFile[],
  units: Unit[],
  passes: Map<string, UnitPass>,
  decide: (decisions: UnitDecision[]) => void,
): Promise<Judgment[]> {
  const whole = new Set<Unit>();
  const groups = new Map<string, { pass: UnitPass; units: Unit[] }>();
  for (const unit of units) {
    const pass = passes.get(unit.id);
    if (pass === undefined) {
      whole.add(unit);
    } else if (pass.head === pull.head.sha && pass.base === pull.base.sha) {
      decide(noUnit([unit], "passed at this head"));
    } else {
      const key = `${pass.head} ${pass.base}`;
      const group = groups.get(key) ?? { pass, units: [] };
      group.units.push(unit);
      groups.set(key, group);
    }
  }

  const since: Judgment[] = [];
  for (const { pass, units: grouped } of groups.values()) {
    const changed = await changedSincePass(job, deps, pass, pull, files);
    if (changed === null) {
      for (const unit of grouped) whole.add(unit);
    } else if (changed.length === 0) {
      decide(
        noUnit(grouped, `no changes since ${pass.head.slice(0, 7)}`, pass.head),
      );
    } else {
      since.push({ units: grouped, files: changed, since: pass.head });
    }
  }
  // In config order, so a pull request without passes asks as it always has.
  const all = units.filter((unit) => whole.has(unit));
  return all.length === 0 ? since : [{ units: all, files }, ...since];
}

/**
 * The files whose changes differ from when a unit passed, or null when the
 * comparison can't be trusted and the whole change needs judging.
 */
async function changedSincePass(
  job: PlanJob,
  deps: PlanDeps,
  pass: UnitPass,
  pull: Pull,
  files: PullFile[],
): Promise<PullFile[] | null> {
  // A file missing from either list could hide a change.
  if (files.length < pull.changed_files) return null;
  let then: PullFile[] | null;
  try {
    then = await deps.repo.compare(pass.base, pass.head);
  } catch (error) {
    console.error(`${job.repo}#${job.number} compare failed`, error);
    return null;
  }
  // GitHub can collect a head a force push left unreachable.
  if (then === null || then.length >= COMPARE_FILE_LIMIT) return null;
  return changedSince(files, then);
}
