import {
  decideLabels,
  labelRequest,
  labelScores,
  parseConfig,
  resolveLabels,
  type Item,
  type LabelDecision,
  type Request,
  type Response,
} from "@sargunv/rubberstamp-core";

import { budgetPeriod, type Budget } from "../budget.ts";
import type { RepoApi } from "../github/client.ts";
import type { Store } from "../store.ts";

export type LabelJob = {
  type: "label";
  installationId: number;
  repoId: number;
  repo: string;
  number: number;
};

export type LabelDeps = {
  repo: RepoApi;
  store: Store;
  ask: (request: Request) => Promise<Response>;
  model: string;
  budget: Budget;
  now?: () => Date;
};

export type LabelOutcome =
  | { status: "skipped"; reason: string; warnings?: string[] }
  | {
      status: "labeled";
      added: string[];
      decisions: LabelDecision[];
      warnings: string[];
    };

export async function runLabelJob(
  job: LabelJob,
  deps: LabelDeps,
): Promise<LabelOutcome> {
  const { repo, store } = deps;
  if (await store.hasLabelRun(job.repoId, job.number)) {
    return { status: "skipped", reason: "already judged" };
  }
  const source = await repo.config();
  if (source === null) return { status: "skipped", reason: "no config" };
  const parsed = parseConfig(source);
  if (!parsed.ok) {
    return {
      status: "skipped",
      reason: "invalid config",
      warnings: parsed.errors,
    };
  }
  const { config } = parsed;
  if (!config.labels) return { status: "skipped", reason: "labels disabled" };

  const { groups, warnings } = resolveLabels(config, await repo.labels());
  if (groups.length === 0) {
    return { status: "skipped", reason: "no label groups", warnings };
  }

  const period = budgetPeriod(deps.now?.() ?? new Date());
  if (
    (await store.usage(job.installationId, period)) >= deps.budget.installation
  ) {
    return { status: "skipped", reason: "monthly budget spent", warnings };
  }
  if ((await store.globalUsage(period)) >= deps.budget.global) {
    return { status: "skipped", reason: "global budget spent", warnings };
  }

  const issue = await repo.issue(job.number);
  const item: Item =
    issue.pull_request === undefined
      ? { type: "issue", title: issue.title, body: issue.body }
      : {
          type: "pull request",
          title: issue.title,
          body: issue.body,
          files: await repo.pullFiles(job.number),
        };
  const request = labelRequest(config, groups, item, deps.model);
  const response = await deps.ask(request);
  await store.addUsage(job.installationId, period, response.usage.input_tokens);

  const scores = labelScores(groups, response.answers);
  // Read the labels again in case someone labeled the item while Jev judged it.
  const present = (await repo.issue(job.number)).labels.map((l) => l.name);
  const decisions = decideLabels(groups, scores, present);
  const added = decisions.filter((d) => d.add).map((d) => d.label);
  if (added.length > 0) await repo.addLabels(job.number, added);

  await store.saveLabelRun({
    installationId: job.installationId,
    repoId: job.repoId,
    repo: job.repo,
    number: job.number,
    model: response.model,
    decisions,
    added,
    inputTokens: response.usage.input_tokens,
  });
  return { status: "labeled", added, decisions, warnings };
}
