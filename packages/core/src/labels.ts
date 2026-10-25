import type { Config } from "./config.ts";
import { squash } from "./describe.ts";
import { glob } from "./glob.ts";
import type { Answer, Json, Question } from "./jev.ts";
import {
  alwaysDecides,
  askQuestions,
  firstRule,
  ruleAsks,
  type Facts,
  type Rule,
  type Verdict,
} from "./rules.ts";

export type RepoLabel = { name: string; description: string | null };

export type ResolvedLabel = {
  name: string;
  meaning: string;
  /** Whether the meaning comes from the config rather than GitHub. */
  fromConfig: boolean;
  rules: Rule[];
};

export type ResolvedGroup = {
  id: string;
  /** One Choice over the labels, rather than one Noul per label. */
  choice: boolean;
  min: number;
  max: number | undefined;
  /** Whether more passing labels than `max` are cut to it or all left off. */
  over: "cut" | "none";
  guidance: string | undefined;
  threshold: number;
  /** Checked before each label's own rules. */
  rules: Rule[];
  labels: ResolvedLabel[];
};

export type Resolution = { groups: ResolvedGroup[]; warnings: string[] };

// A Choice's probabilities compete, so 0.5 means "more likely than every other
// option combined". A Noul is independent, so 0.5 means "more likely than
// not"; demanding more left out labels that fit in practice.
const DEFAULT_THRESHOLD = { choice: 0.5, noul: 0.5 };
export const NONE = "none of these";

/**
 * Match the configured groups against the labels that exist on the repo. A
 * label takes its entry under its exact name, or else under the first pattern
 * that matches it.
 */
export function resolveLabels(
  config: Config,
  repoLabels: RepoLabel[],
): Resolution {
  const section = config.labels;
  if (!section) return { groups: [], warnings: [] };
  const warnings: string[] = [];
  const claimed = new Map<string, string>();
  const groups: ResolvedGroup[] = [];

  for (const [id, group] of Object.entries(section.groups)) {
    const entries = Object.entries(group.labels);
    const exact = new Map(
      entries.map(([key, entry]) => [key.toLowerCase(), entry]),
    );
    const labels: ResolvedLabel[] = [];
    for (const [pattern, patternEntry] of entries) {
      const matches = repoLabels.filter((label) =>
        glob(pattern, { ignoreCase: true })(label.name),
      );
      if (matches.length === 0) {
        warnings.push(`Group ${id}: no repository label matches "${pattern}".`);
      }
      for (const label of matches) {
        const key = label.name.toLowerCase();
        const owner = claimed.get(key);
        if (owner === id) continue;
        if (owner) {
          warnings.push(
            `Label ${label.name} is in groups ${owner} and ${id}; it stays in ${owner}.`,
          );
          continue;
        }
        claimed.set(key, id);
        const entry = exact.get(key) ?? patternEntry;
        const meaning = entry.meaning ?? label.description ?? "";
        if (!meaning.trim()) {
          warnings.push(
            `Label ${label.name} has no description, so Jev sees only its name.`,
          );
        }
        labels.push({
          name: label.name,
          meaning: squash(meaning),
          fromConfig: entry.meaning !== undefined,
          rules: entry.rules,
        });
      }
    }
    if (labels.length === 0) continue;
    if (group.min > labels.length) {
      warnings.push(
        `Group ${id} needs ${group.min} labels but only ${labels.length} exist.`,
      );
    }
    const choice = group.max === 1 && labels.length > 1;
    groups.push({
      id,
      choice,
      min: group.min,
      max: group.max,
      over: group.over,
      guidance:
        group.guidance === undefined ? undefined : squash(group.guidance),
      threshold:
        group.threshold ?? DEFAULT_THRESHOLD[choice ? "choice" : "noul"],
      rules: group.rules,
      labels,
    });
  }
  return { groups, warnings };
}

/** The questions every group's and label's rules ask, each once. */
export function labelAsks(groups: ResolvedGroup[]): string[] {
  return ruleAsks(
    groups.flatMap((group) => [
      ...group.rules,
      ...group.labels.flatMap((label) => label.rules),
    ]),
  );
}

export function groupQuestionKey(group: ResolvedGroup): string {
  return `group:${group.id}`;
}

export function labelQuestionKey(label: ResolvedLabel): string {
  return `label:${label.name}`;
}

/** Whether a label's own score can decide it, so it's worth asking about. */
function scored(group: ResolvedGroup, label: ResolvedLabel): boolean {
  return !alwaysDecides([...group.rules, ...label.rules]);
}

/** The questions for each label a score can decide, and every rule question. */
export function labelQuestions(
  groups: ResolvedGroup[],
): Record<string, Question> {
  const questions: Record<string, Question> = {};
  for (const group of groups) {
    if (!group.labels.some((label) => scored(group, label))) continue;
    const guidance: Record<string, Json> = group.guidance
      ? { guidance: group.guidance }
      : {};
    if (group.choice) {
      const criteria: Record<string, Json> = Object.fromEntries(
        group.labels.map((label) => [label.name, label.meaning || label.name]),
      );
      if (group.min === 0) {
        criteria[NONE] = "None of these labels describes this work.";
      }
      questions[groupQuestionKey(group)] = {
        type: "choice",
        instructions: {
          question:
            "Which label best describes this issue or pull request? Judge the " +
            "work it reports, requests, or makes, not the files it touches.",
          ...guidance,
        },
        criteria,
      };
      continue;
    }
    for (const label of group.labels) {
      if (!scored(group, label)) continue;
      questions[labelQuestionKey(label)] = {
        type: "noul",
        instructions: {
          question:
            `Should this issue or pull request get the \`${label.name}\` ` +
            "label? A maintainer searching for that label would expect to " +
            "find it.",
          label: label.meaning || label.name,
          ...guidance,
        },
        criteria: {
          true: "What the label describes is a subject of this work.",
          false:
            "The work does not concern what the label describes, or touches " +
            "it only in passing.",
        },
      };
    }
  }
  return { ...questions, ...askQuestions(labelAsks(groups)) };
}

/** Each label's probability, keyed by label name. */
export type Scores = Record<string, number>;

export function labelScores(
  groups: ResolvedGroup[],
  answers: Record<string, Answer>,
): Scores {
  const scores: Scores = {};
  for (const group of groups) {
    if (group.choice) {
      const answer = answers[groupQuestionKey(group)];
      for (const label of group.labels) {
        scores[label.name] =
          answer?.type === "choice"
            ? (answer.probabilities[label.name] ?? 0)
            : 0;
      }
      continue;
    }
    for (const label of group.labels) {
      const answer = answers[labelQuestionKey(label)];
      scores[label.name] = answer?.type === "noul" ? answer.noul : 0;
    }
  }
  return scores;
}

export type LabelDecision = {
  label: string;
  group: string;
  add: boolean;
  score: number;
  /**
   * Why the score alone didn't decide: "present", "group labeled", "filled to
   * min", "cut by max", "over max", or the rule that applied or skipped it.
   */
  rule: string;
};

/**
 * Decide which labels to add. A group gets labels only when it has none, so a
 * label that a template, a bot, or a person set always wins. The group's rules,
 * then the label's, can apply or skip a label outright; otherwise it passes at
 * or above the threshold. Passing labels over the group's `max` are cut to it,
 * least likely first, or all left off for `over: none`. The most likely labels
 * that no rule skipped then fill the group to its `min`.
 */
export function decideLabels(
  groups: ResolvedGroup[],
  scores: Scores,
  present: Iterable<string>,
  facts: Facts,
): LabelDecision[] {
  const existing = new Set([...present].map((name) => name.toLowerCase()));
  const decisions: LabelDecision[] = [];
  for (const group of groups) {
    const score = (label: ResolvedLabel) => scores[label.name] ?? 0;
    if (group.labels.some((label) => existing.has(label.name.toLowerCase()))) {
      for (const label of group.labels) {
        decisions.push({
          label: label.name,
          group: group.id,
          add: false,
          score: score(label),
          rule: existing.has(label.name.toLowerCase())
            ? "present"
            : "group labeled",
        });
      }
      continue;
    }
    const verdicts = new Map<ResolvedLabel, Verdict | undefined>(
      group.labels.map((label) => [
        label,
        firstRule(group.rules, facts, (i) => `group rule ${i + 1}`) ??
          firstRule(label.rules, facts, (i) => `label rule ${i + 1}`),
      ]),
    );
    const verdict = (label: ResolvedLabel) => verdicts.get(label)?.then;
    // Labels a rule applies rank ahead of those that only passed.
    const ranked = [...group.labels].sort(
      (a, b) =>
        Number(verdict(b) === "apply") - Number(verdict(a) === "apply") ||
        score(b) - score(a),
    );
    const passing = ranked.filter(
      (label) =>
        verdict(label) === "apply" ||
        (verdict(label) === undefined && score(label) >= group.threshold),
    );
    const over = group.max !== undefined && passing.length > group.max;
    const kept = new Set(
      over && group.over === "none" ? [] : passing.slice(0, group.max),
    );
    const filled = new Set(
      ranked
        .filter((label) => !kept.has(label) && verdict(label) !== "skip")
        .slice(0, Math.max(0, group.min - kept.size)),
    );
    for (const label of group.labels) {
      const dropped = passing.includes(label) && !kept.has(label);
      decisions.push({
        label: label.name,
        group: group.id,
        add: kept.has(label) || filled.has(label),
        score: score(label),
        rule: filled.has(label)
          ? "filled to min"
          : dropped
            ? group.over === "none"
              ? "over max"
              : "cut by max"
            : (verdicts.get(label)?.why ?? ""),
      });
    }
  }
  return decisions;
}
