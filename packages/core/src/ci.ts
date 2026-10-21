import * as v from "valibot";

import type { Config } from "./config.ts";
import {
  BODY_LIMIT,
  chunk,
  contextText,
  fileList,
  filePatch,
  squash,
  type PullFile,
} from "./describe.ts";
import { glob } from "./glob.ts";
import type { Answer, Json, Question, Request } from "./jev.ts";

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
  paths: string[];
  threshold: number;
};

/** The pull request a plan judges. */
export type Change = { title: string; body: string | null; files: PullFile[] };

export const UnitDecision = v.object({
  unit: v.string(),
  threshold: v.number(),
  run: v.boolean(),
  /** Jev's probability, or null when a rule decided without asking. */
  score: v.nullable(v.number()),
  /** Why the unit runs regardless of its score, or "" when the score decided. */
  rule: v.string(),
});

export type UnitDecision = v.InferOutput<typeof UnitDecision>;

export function ciUnits(config: Config): Unit[] {
  const section = config.ci;
  if (!section) return [];
  return Object.entries(section.units).map(([id, unit]) => ({
    id,
    covers: unit.covers,
    paths: unit.paths,
    threshold: unit.threshold ?? section.threshold ?? DEFAULT_CI_THRESHOLD,
  }));
}

export function unitQuestionKey(unit: Unit): string {
  return `unit:${unit.id}`;
}

export function unitQuestions(units: Unit[]): Record<string, Question> {
  return Object.fromEntries(
    units.map((unit) => [
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
    files: fileList(change.files),
  };
  const fixed = {
    ...(context === undefined ? {} : { repository: context }),
    change: described,
  };
  const chunks = chunk(
    change.files.map(filePatch),
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
 * when any chunk lacks a unit's answer, since a missing answer isn't a no.
 */
export function unitScores(
  units: Unit[],
  answers: Record<string, Answer>[],
): Record<string, number> | null {
  const scores: Record<string, number> = {};
  for (const unit of units) {
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

/** Units at or above their threshold, and every unit a changed path forces. */
export function decideUnits(
  units: Unit[],
  scores: Record<string, number>,
  paths: string[],
): UnitDecision[] {
  return units.map((unit) => {
    const score = scores[unit.id] ?? 0;
    const forced = unit.paths.find((pattern) => paths.some(glob(pattern)));
    return {
      unit: unit.id,
      threshold: unit.threshold,
      run: forced !== undefined || score >= unit.threshold,
      score,
      rule: forced === undefined ? "" : `matches ${forced}`,
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
