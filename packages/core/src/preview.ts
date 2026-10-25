import * as v from "valibot";

import type { ResolvedGroup } from "./labels.ts";

/** An issue or pull request's state, as GitHub shows it. */
export const ItemState = v.picklist([
  "open",
  "draft",
  "merged",
  "closed",
  "completed",
  "not planned",
]);

export type ItemState = v.InferOutput<typeof ItemState>;

export const PreviewItem = v.object({
  number: v.number(),
  type: v.picklist(["issue", "pull request"]),
  title: v.string(),
  state: ItemState,
  author: v.string(),
  createdAt: v.string(),
  url: v.string(),
  /** Labels on the item on GitHub when the preview ran. */
  labels: v.array(v.string()),
  inputTokens: v.number(),
  scores: v.record(v.string(), v.number()),
  /** Decisions as if the item had no labels yet. */
  decisions: v.array(
    v.object({
      label: v.string(),
      group: v.string(),
      add: v.boolean(),
      score: v.number(),
      rule: v.string(),
    }),
  ),
});

export type PreviewItem = v.InferOutput<typeof PreviewItem>;

export const PreviewGroup = v.object({
  id: v.string(),
  choice: v.boolean(),
  min: v.number(),
  max: v.optional(v.number()),
  /** Absent from previews made before `over` existed, which always cut. */
  over: v.optional(v.picklist(["cut", "none"])),
  threshold: v.number(),
  labels: v.array(
    v.object({
      name: v.string(),
      meaning: v.string(),
      fromConfig: v.optional(v.boolean()),
    }),
  ),
});

export type PreviewGroup = v.InferOutput<typeof PreviewGroup>;

/** Resolved groups as JSON, without their optional fields when unset. */
export function previewGroups(groups: ResolvedGroup[]): PreviewGroup[] {
  return groups.map((g) => ({
    id: g.id,
    choice: g.choice,
    min: g.min,
    ...(g.max === undefined ? {} : { max: g.max }),
    over: g.over,
    threshold: g.threshold,
    labels: g.labels.map((l) => ({
      name: l.name,
      meaning: l.meaning,
      fromConfig: l.fromConfig,
    })),
  }));
}

/** How Rubberstamp would label a repository's latest items with its config. */
export const Preview = v.object({
  repo: v.string(),
  createdAt: v.string(),
  model: v.string(),
  /** The config file's source when the preview ran. */
  config: v.string(),
  labels: v.array(
    v.object({
      name: v.string(),
      color: v.string(),
      description: v.nullable(v.string()),
    }),
  ),
  groups: v.array(PreviewGroup),
  items: v.array(PreviewItem),
  inputTokens: v.number(),
});

export type Preview = v.InferOutput<typeof Preview>;
