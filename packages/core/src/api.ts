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

/**
 * How much of the installation's monthly allowance is used, as a fraction that
 * can pass 1. Never tokens or money: the allowance's unit may change.
 */
const Allowance = v.object({ used: v.number() });

/** One repository's state in Rubberstamp, for its page. */
export const RepoStatus = v.variant("status", [
  v.object({ status: v.literal("not installed"), installUrl: v.string() }),
  v.object({ status: v.literal("not allowed") }),
  v.object({ status: v.literal("archived") }),
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
    allowance: Allowance,
  }),
]);

export type RepoStatus = v.InferOutput<typeof RepoStatus>;

export const PreviewState = v.object({
  preview: v.nullable(Preview),
  /** The fraction of the monthly allowance the stored preview spent. */
  share: v.nullable(v.number()),
});

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
  title: v.string(),
  type: v.picklist(["issue", "pull request"]),
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
  /** The label groups the item was judged with, as they were then. */
  groups: v.array(PreviewGroup),
  inputTokens: v.number(),
  createdAt: v.string(),
});

export type LogEntry = v.InferOutput<typeof LogEntry>;

export const Log = v.object({ entries: v.array(LogEntry) });

export type Log = v.InferOutput<typeof Log>;

/** A label run anywhere in an account, for its activity list. */
export const ActivityEntry = v.object({
  ...LogEntry.entries,
  repo: v.string(),
});

export type ActivityEntry = v.InferOutput<typeof ActivityEntry>;

/** An account's installation of Rubberstamp, for its page. */
export const Account = v.object({
  login: v.string(),
  type: v.picklist(["User", "Organization"]),
  /** Where the account manages the installation on GitHub. */
  manageUrl: v.string(),
  /** The calendar month the allowance covers, such as `2026-10`. */
  period: v.string(),
  allowance: v.object({
    used: v.number(),
    /** Whether the account has a custom allowance. */
    raised: v.boolean(),
    /** Whether Rubberstamp's shared monthly ceiling is spent, which stops every account. */
    ceilingReached: v.boolean(),
  }),
  /** Repositories the user can tune, busiest first. */
  repos: v.array(
    v.object({
      name: v.string(),
      private: v.boolean(),
      /** This month's share of the allowance. */
      share: v.number(),
      labeled: v.number(),
      lastLabeledAt: v.nullable(v.string()),
    }),
  ),
  /** Usage from before it was tracked per repository. */
  unattributed: v.number(),
  activity: v.array(ActivityEntry),
});

export type Account = v.InferOutput<typeof Account>;
