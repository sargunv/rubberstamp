import {
  decideLabels,
  labelRequest,
  labelScores,
  parseConfig,
  previewGroups,
  resolveLabels,
  type Item,
  type ItemState,
  type Preview,
  type PreviewItem,
  type Request,
  type Response,
} from "@sargunv/rubberstamp-core";

import type { ListedItem, RepoApi } from "../github/client.ts";

export type BuildDeps = {
  repo: RepoApi;
  ask: (request: Request) => Promise<Response>;
  model: string;
  /** How many of the newest items to preview. */
  count: number;
  /** Called as each item is judged. */
  onProgress?: (done: number, total: number) => void;
  now?: () => Date;
};

export type BuildResult =
  | { ok: true; preview: Preview }
  | { ok: false; error: string };

// Jev requests in flight at once, so a large sample stays under rate limits.
const CONCURRENCY = 8;

function itemState(item: ListedItem): ItemState {
  if (item.pull_request) {
    if (item.pull_request.merged_at) return "merged";
    if (item.state === "open") return item.draft ? "draft" : "open";
    return "closed";
  }
  if (item.state === "open") return "open";
  return item.state_reason === "not_planned" ? "not planned" : "completed";
}

async function mapLimited<T, U>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<U>,
): Promise<U[]> {
  const results: U[] = [];
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      const item = items[index];
      if (item !== undefined) results[index] = await fn(item);
    }
  };
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

/**
 * Label a repository's newest items with its config, as if they had no labels
 * yet. Nothing is written to GitHub.
 */
export async function buildPreview(deps: BuildDeps): Promise<BuildResult> {
  const { repo } = deps;
  const file = await repo.config();
  if (file === null) return { ok: false, error: "No config file" };
  const parsed = parseConfig(file.source);
  if (!parsed.ok) return { ok: false, error: parsed.errors.join("; ") };
  const { config } = parsed;
  if (!config.labels) return { ok: false, error: "Labeling is off" };

  const labels = await repo.labels();
  const { groups } = resolveLabels(config, labels);
  if (groups.length === 0) {
    return { ok: false, error: "No label group matches a label" };
  }

  const listed = await repo.recentItems(deps.count);
  let model = deps.model;
  let done = 0;
  deps.onProgress?.(done, listed.length);
  const items = await mapLimited(
    listed,
    CONCURRENCY,
    async (listedItem): Promise<PreviewItem> => {
      const isPull = listedItem.pull_request !== undefined;
      const item: Item = isPull
        ? {
            type: "pull request",
            title: listedItem.title,
            body: listedItem.body,
            files: await repo.pullFiles(listedItem.number),
          }
        : { type: "issue", title: listedItem.title, body: listedItem.body };
      const response = await deps.ask(
        labelRequest(config, groups, item, deps.model),
      );
      model = response.model;
      deps.onProgress?.(++done, listed.length);
      const scores = labelScores(groups, response.answers);
      return {
        number: listedItem.number,
        type: item.type,
        title: listedItem.title,
        state: itemState(listedItem),
        author: listedItem.user?.login ?? "ghost",
        createdAt: listedItem.created_at,
        url: listedItem.html_url,
        labels: listedItem.labels.map((l) => l.name),
        inputTokens: response.usage.input_tokens,
        scores,
        decisions: decideLabels(groups, scores, []),
      };
    },
  );

  return {
    ok: true,
    preview: {
      repo: repo.fullName,
      createdAt: (deps.now?.() ?? new Date()).toISOString(),
      model,
      config: file.source,
      labels,
      groups: previewGroups(groups),
      items,
      inputTokens: items.reduce((sum, i) => sum + i.inputTokens, 0),
    },
  };
}
