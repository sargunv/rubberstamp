import * as v from "valibot";

import { Preview, PreviewGroup } from "./preview.ts";

/** The signed-in user. */
export const Me = v.object({ login: v.string(), avatarUrl: v.string() });

export type Me = v.InferOutput<typeof Me>;

/** Repositories the signed-in user can tune. */
export const RepoList = v.object({
  repos: v.array(v.object({ name: v.string(), private: v.boolean() })),
  installUrl: v.string(),
});

export type RepoList = v.InferOutput<typeof RepoList>;

const TokenBudget = v.object({ used: v.number(), limit: v.number() });

/** One repository's state in Rubberstamp, for its page. */
export const RepoStatus = v.variant("status", [
  v.object({ status: v.literal("not installed"), installUrl: v.string() }),
  v.object({ status: v.literal("not allowed") }),
  v.object({ status: v.literal("no config") }),
  v.object({
    status: v.literal("invalid config"),
    errors: v.array(v.string()),
  }),
  v.object({
    status: v.literal("ready"),
    /** The config on the default branch, resolved against the repo's labels. */
    config: v.object({
      path: v.string(),
      source: v.string(),
      labels: v.array(
        v.object({
          name: v.string(),
          color: v.string(),
          description: v.nullable(v.string()),
        }),
      ),
      groups: v.array(PreviewGroup),
      warnings: v.array(v.string()),
    }),
    budget: TokenBudget,
  }),
]);

export type RepoStatus = v.InferOutput<typeof RepoStatus>;

export const PreviewState = v.object({ preview: v.nullable(Preview) });

export type PreviewState = v.InferOutput<typeof PreviewState>;

export const PreviewResult = v.variant("ok", [
  v.object({ ok: v.literal(true), preview: Preview }),
  v.object({ ok: v.literal(false), error: v.string() }),
]);

export type PreviewResult = v.InferOutput<typeof PreviewResult>;

/** One line of a running preview's progress stream. */
export const PreviewEvent = v.variant("type", [
  v.object({
    type: v.literal("progress"),
    done: v.number(),
    total: v.number(),
  }),
  v.object({ type: v.literal("result"), result: PreviewResult }),
]);

export type PreviewEvent = v.InferOutput<typeof PreviewEvent>;

/** One item Rubberstamp labeled, as its decision log shows it. */
export const LogEntry = v.object({
  number: v.number(),
  /** Missing for runs recorded before titles were. */
  title: v.nullable(v.string()),
  type: v.nullable(v.picklist(["issue", "pull request"])),
  model: v.string(),
  decisions: v.array(
    v.object({
      label: v.string(),
      group: v.string(),
      add: v.boolean(),
      score: v.number(),
      rule: v.string(),
    }),
  ),
  added: v.array(v.string()),
  inputTokens: v.number(),
  createdAt: v.string(),
});

export type LogEntry = v.InferOutput<typeof LogEntry>;

export const Log = v.object({ entries: v.array(LogEntry) });

export type Log = v.InferOutput<typeof Log>;
