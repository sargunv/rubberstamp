import {
  decideLabels,
  labelRequest,
  labelScores,
  parseConfig,
  previewGroups,
  resolveLabels,
  type Item,
  type LabelDecision,
  type Request,
  type Response,
} from "@sargunv/rubberstamp-core";

import { budgetPeriod, budgetSpent, type Budget } from "../budget.ts";
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
  const { config } = parsed;
  if (!config.labels) return { status: "skipped", reason: "labels disabled" };

  const { groups, warnings } = resolveLabels(config, await repo.labels());
  if (groups.length === 0) {
    return { status: "skipped", reason: "no label groups", warnings };
  }

  const period = budgetPeriod(deps.now?.() ?? new Date());
  const spent = await budgetSpent(
    store,
    job.installationId,
    period,
    deps.budget,
  );
  if (spent) return { status: "skipped", reason: spent, warnings };

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
  await store.addUsage(
    job.installationId,
    period,
    job.repo,
    "labels",
    response.usage.input_tokens,
  );

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
    title: issue.title,
    type: item.type,
    model: response.model,
    groups: previewGroups(groups),
    decisions,
    added,
    inputTokens: response.usage.input_tokens,
  });
  return { status: "labeled", added, decisions, warnings };
}
