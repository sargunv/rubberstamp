import {
  decideLabels,
  hashJson,
  labelRequest,
  labelScores,
  parseConfig,
  resolveLabels,
  type Item,
  type Json,
  type LabelDecision,
  type Request,
  type Response,
} from "@sargunv/rubberstamp-core";

import type { RepoApi } from "../github/client.ts";
import type { CachedAnswer, Store } from "../store.ts";

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
  dailyTokens: number;
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

  const day = (deps.now?.() ?? new Date()).toISOString().slice(0, 10);
  if ((await store.usage(job.installationId, day)) >= deps.dailyTokens) {
    return { status: "skipped", reason: "daily budget spent", warnings };
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
  await store.addUsage(job.installationId, day, response.usage.input_tokens);

  const scores = labelScores(groups, response.answers);
  // Read the labels again in case someone labeled the item while Jev judged it.
  const present = (await repo.issue(job.number)).labels.map((l) => l.name);
  const decisions = decideLabels(groups, scores, present);
  const added = decisions.filter((d) => d.add).map((d) => d.label);
  if (added.length > 0) await repo.addLabels(job.number, added);

  const stateKey = await hashJson(request.state);
  const answers: CachedAnswer[] = [];
  for (const [key, question] of Object.entries(request.questions)) {
    const answer = response.answers[key];
    if (!answer) continue;
    answers.push({
      stateKey,
      questionKey: await hashJson(question),
      model: response.model,
      answer: toJson(answer),
    });
  }
  await store.saveState(stateKey, request.state);
  await store.saveLabelRun(
    {
      repoId: job.repoId,
      repo: job.repo,
      number: job.number,
      stateKey,
      model: response.model,
      decisions,
      added,
      inputTokens: response.usage.input_tokens,
    },
    answers,
  );
  return { status: "labeled", added, decisions, warnings };
}

function toJson(answer: Response["answers"][string]): Json {
  return answer.type === "noul"
    ? { type: "noul", noul: answer.noul }
    : {
        type: "choice",
        choice: answer.choice,
        probabilities: answer.probabilities,
      };
}
