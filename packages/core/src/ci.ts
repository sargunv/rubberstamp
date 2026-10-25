import * as v from "valibot";

import type { Config } from "./config.ts";
import {
  BODY_LIMIT,
  chunk,
  contextText,
  fileList,
  filePatch,
  REVERTED,
  squash,
  type PullFile,
} from "./describe.ts";
import { hashJson } from "./hash.ts";
import type { Answer, Json, Question, Request } from "./jev.ts";
import {
  alwaysDecides,
  askQuestions,
  firstRule,
  ruleAsks,
  type Rule,
} from "./rules.ts";

export const DEFAULT_CI_THRESHOLD = 0.5;
// One request sees the state and its questions within Jev's context. Code and
// diffs average well above three characters per token, so this leaves headroom.
const STATE_BUDGET = 84_000;
// A larger change runs every unit: judging it costs many requests, and
// reviewers expect broad coverage for it anyway.
const MAX_CHUNKS = 8;

/** A configured unit, with its threshold resolved. */
export type Unit = {
  id: string;
  covers: string;
  rules: Rule[];
  threshold: number;
};

/**
 * The pull request a plan judges: all of it, or only what changed since its
 * units last passed at the commit `since`.
 */
export type Change = {
  title: string;
  body: string | null;
  files: PullFile[];
  since?: string;
};

export const UnitDecision = v.object({
  unit: v.string(),
  threshold: v.number(),
  run: v.boolean(),
  /** Jev's probability, or null when a rule decided without asking. */
  score: v.nullable(v.number()),
  /** What decided the unit regardless of its score, or "" when the score did. */
  rule: v.string(),
  /**
   * The commit where the unit last passed, when it was judged only on what
   * changed since. Absent when judged on the whole pull request.
   */
  since: v.optional(v.string()),
});

export type UnitDecision = v.InferOutput<typeof UnitDecision>;

export function ciUnits(config: Config): Unit[] {
  const section = config.ci;
  if (!section) return [];
  return Object.entries(section.units).map(([id, unit]) => ({
    id,
    covers: unit.covers,
    rules: unit.rules,
    threshold: unit.threshold ?? section.threshold ?? DEFAULT_CI_THRESHOLD,
  }));
}

/**
 * Identifies everything in the config that shapes a plan: the shared context
 * and the ci section. A plan judged under another config doesn't hold.
 */
export async function ciConfigHash(config: Config): Promise<string> {
  const material: Json = JSON.parse(
    JSON.stringify({ context: config.context ?? null, ci: config.ci ?? null }),
  );
  return (await hashJson(material)).slice(0, 16);
}

export function unitQuestionKey(unit: Unit): string {
  return `unit:${unit.id}`;
}

/** The questions the units' rules ask, each once. */
export function unitAsks(units: Unit[]): string[] {
  return ruleAsks(units.flatMap((unit) => unit.rules));
}

/** The questions for each unit a score can decide, and every rule question. */
export function unitQuestions(units: Unit[]): Record<string, Question> {
  const questions = Object.fromEntries(
    units
      .filter((unit) => !alwaysDecides(unit.rules))
      .map((unit) => [
        unitQuestionKey(unit),
        {
          type: "noul",
          instructions: {
            question:
              `Should the \`${unit.id}\` CI coverage run to verify this pull ` +
              "request before merging? A maintainer reviewing the diff would " +
              "want to see it pass.",
            coverage: squash(unit.covers),
          },
          criteria: {
            true:
              "The change modifies code, dependencies, tools, build logic, " +
              "packaging, or job definitions that this coverage builds, " +
              "installs, or tests in a way its result would verify.",
            false:
              "This coverage does not build, install, package, or test anything " +
              "the change modifies in a way that matters.",
          },
        } satisfies Question,
      ]),
  );
  return { ...questions, ...askQuestions(unitAsks(units)) };
}

/**
 * One request per chunk of the patch, each with the whole file list, or null
 * when the change is too large to judge.
 */
export function planRequests(
  config: Config,
  units: Unit[],
  change: Change,
  model: string,
): Request[] | null {
  const context = contextText(config.context, config.ci?.context);
  const described: { [key: string]: Json } = {
    title: change.title,
    body: (change.body ?? "").slice(0, BODY_LIMIT),
    ...(change.since === undefined
      ? {}
      : {
          scope:
            "Only the files whose changes differ from the pull request at " +
            `commit ${change.since.slice(0, 7)}, where this coverage last ` +
            "passed. The rest of the pull request already passed it.",
        }),
    files: fileList(change.files),
  };
  const fixed = {
    ...(context === undefined ? {} : { repository: context }),
    change: described,
  };
  const chunks = chunk(
    change.files.filter((file) => file.status !== REVERTED).map(filePatch),
    STATE_BUDGET - JSON.stringify(fixed).length,
  );
  if (chunks.length > MAX_CHUNKS) return null;
  const questions = unitQuestions(units);
  return chunks.map((patch, index) => ({
    model,
    state: {
      ...fixed,
      change: {
        ...described,
        patch,
        ...(chunks.length > 1
          ? {
              patch_part: `Part ${index + 1} of ${chunks.length} of the patch. The file list covers the whole change.`,
            }
          : {}),
      },
    },
    questions,
  }));
}

/**
 * Each unit's probability: the highest any chunk of the patch gave it. Null
 * when any chunk lacks a unit's answer, since a missing answer isn't a no. A
 * unit that its rules always decide isn't asked about and has no score.
 */
export function unitScores(
  units: Unit[],
  answers: Record<string, Answer>[],
): Record<string, number> | null {
  const scores: Record<string, number> = {};
  for (const unit of units) {
    if (alwaysDecides(unit.rules)) continue;
    let highest = 0;
    for (const chunk of answers) {
      const answer = chunk[unitQuestionKey(unit)];
      if (answer?.type !== "noul") return null;
      highest = Math.max(highest, answer.noul);
    }
    scores[unit.id] = highest;
  }
  return scores;
}

/** The paths a change touches, including where renamed files came from. */
export function changedPaths(files: PullFile[]): string[] {
  return files.flatMap((file) =>
    file.previous_filename === undefined
      ? [file.filename]
      : [file.previous_filename, file.filename],
  );
}

/**
 * Each unit's decision: the first of its rules that matches, or else its score
 * against its threshold. `asks` holds each rule question's probability, and
 * `since` is the pass the change was judged from, if not the merge base.
 */
export function decideUnits(
  units: Unit[],
  scores: Record<string, number>,
  asks: Record<string, number>,
  paths: string[],
  since?: string,
): UnitDecision[] {
  return units.map((unit) => {
    const score = scores[unit.id];
    const verdict = firstRule(
      unit.rules,
      { kind: "pr", paths, asks },
      (i) => `rule ${i + 1}`,
    );
    return {
      unit: unit.id,
      threshold: unit.threshold,
      run:
        verdict === undefined
          ? (score ?? 0) >= unit.threshold
          : verdict.then === "apply",
      score: score ?? null,
      rule: verdict?.why ?? "",
      ...(since === undefined ? {} : { since }),
    };
  });
}

/** Run every unit without asking, for the given reason. */
export function everyUnit(units: Unit[], rule: string): UnitDecision[] {
  return units.map((unit) => ({
    unit: unit.id,
    threshold: unit.threshold,
    run: true,
    score: null,
    rule,
  }));
}

/** Run none of the units, without asking, for the given reason. */
export function noUnit(
  units: Unit[],
  rule: string,
  since?: string,
): UnitDecision[] {
  return units.map((unit) => ({
    unit: unit.id,
    threshold: unit.threshold,
    run: false,
    score: null,
    rule,
    ...(since === undefined ? {} : { since }),
  }));
}

/**
 * The files whose changes differ between a pull request's patches now and
 * its patches when a unit last passed, each as it is now. Both sides must
 * diff from the same merge base, so a patch that differs at all, even in
 * where an edit sits, is a change. A file only the old patches change is
 * listed as reverted. Null when a file on either side has no patch to
 * compare, as binary and very large files don't.
 */
export function changedSince(
  now: PullFile[],
  then: PullFile[],
): PullFile[] | null {
  if ([...now, ...then].some((file) => file.patch === undefined)) return null;
  const change = (file: PullFile) =>
    JSON.stringify([file.status, file.previous_filename ?? null, file.patch]);
  const before = new Map(then.map((file) => [file.filename, change(file)]));
  const present = new Set(now.map((file) => file.filename));
  return [
    ...now.filter((file) => before.get(file.filename) !== change(file)),
    ...then
      .filter((file) => !present.has(file.filename))
      .map((file) => ({
        filename: file.filename,
        ...(file.previous_filename === undefined
          ? {}
          : { previous_filename: file.previous_filename }),
        status: REVERTED,
        additions: 0,
        deletions: 0,
      })),
  ];
}
