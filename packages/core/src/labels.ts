import type { Config, LabelEntry } from "./config.ts";
import { squash } from "./describe.ts";
import { nameGlob } from "./glob.ts";
import type { Answer, Json, Question } from "./jev.ts";
import {
  askQuestions,
  decide,
  ruleAsks,
  type Facts,
  type Otherwise,
  type Rule,
  type Verdict,
} from "./rules.ts";

export type RepoLabel = { name: string; description: string | null };

export type ResolvedLabel = {
  name: string;
  meaning: string;
  /** Whether the meaning comes from the config rather than GitHub. */
  fromConfig: boolean;
  /** The rules of every pattern that matches the label, then its own. */
  rules: Rule[];
  otherwise: Otherwise | undefined;
};

export type ResolvedGroup = {
  id: string;
  /** One Choice over the labels, rather than one question per label. */
  choice: boolean;
  min: number;
  max: number | undefined;
  /** Whether more passing labels than `max` are trimmed to it or all dropped. */
  overflow: "trim" | "drop";
  guidance: string | undefined;
  threshold: number;
  /** Checked before each label's own rules. */
  rules: Rule[];
  otherwise: Otherwise | undefined;
  labels: ResolvedLabel[];
};

export type Resolution = { groups: ResolvedGroup[]; warnings: string[] };

// A Choice's probabilities compete, so 0.5 means "more likely than every other
// option combined". A label's own question offers "only in passing" between yes
// and no; measured against hand labels, 0.65 for its yes added the fewest wrong
// labels without missing right ones.
const DEFAULT_THRESHOLD = { choice: 0.5, label: 0.65 };
export const NONE = "none of these";
export const YES = "yes";

/**
 * Match the configured groups against the labels that exist on the repo. A
 * label takes its meaning from its exact entry, else the first pattern that
 * gives one, else GitHub. It runs every matching pattern's rules, then its
 * exact entry's.
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
    const labels: ResolvedLabel[] = [];
    for (const { name: pattern } of group.labels) {
      const matches = repoLabels.filter((label) =>
        nameGlob(pattern, { ignoreCase: true })(label.name),
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
        labels.push(resolveLabel(label, group.labels, warnings));
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
      overflow: group.overflow,
      guidance:
        group.guidance === undefined ? undefined : squash(group.guidance),
      threshold:
        group.threshold ?? DEFAULT_THRESHOLD[choice ? "choice" : "label"],
      rules: group.rules,
      otherwise: group.otherwise,
      labels,
    });
  }
  return { groups, warnings };
}

function resolveLabel(
  label: RepoLabel,
  entries: LabelEntry[],
  warnings: string[],
): ResolvedLabel {
  const key = label.name.toLowerCase();
  const exact = entries.filter((entry) => entry.name.toLowerCase() === key);
  const patterns = entries.filter(
    (entry) =>
      entry.name.toLowerCase() !== key &&
      nameGlob(entry.name, { ignoreCase: true })(label.name),
  );
  const ordered = [...exact, ...patterns];
  const configured = ordered.find((entry) => entry.meaning !== undefined);
  const meaning = configured?.meaning ?? label.description ?? "";
  if (!meaning.trim()) {
    warnings.push(
      `Label ${label.name} has no description, so Jev sees only its name.`,
    );
  }
  return {
    name: label.name,
    meaning: squash(meaning),
    fromConfig: configured !== undefined,
    rules: [...patterns, ...exact].flatMap((entry) => entry.rules),
    otherwise: ordered.find((entry) => entry.otherwise !== undefined)
      ?.otherwise,
  };
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

/**
 * Every label's built-in question: one Choice per max-one group, and one
 * question per label otherwise, then every rule question. Labels that rules
 * decide are still asked about, so the dashboard can show their scores.
 */
export function labelQuestions(
  groups: ResolvedGroup[],
): Record<string, Question> {
  const questions: Record<string, Question> = {};
  for (const group of groups) {
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
      questions[labelQuestionKey(label)] = {
        type: "choice",
        instructions: {
          question:
            `Should this issue or pull request get the \`${label.name}\` ` +
            "label? A maintainer searching for that label would expect to " +
            "find it.",
          label: label.meaning || label.name,
          ...guidance,
        },
        criteria: {
          [YES]: "What the label describes is a subject of this work.",
          "only in passing":
            "The work touches what the label describes, but only in passing.",
          no: "The work does not concern what the label describes.",
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
    for (const label of group.labels) {
      const answer =
        answers[
          group.choice ? groupQuestionKey(group) : labelQuestionKey(label)
        ];
      const option = group.choice ? label.name : YES;
      scores[label.name] =
        answer?.type === "choice" ? (answer.probabilities[option] ?? 0) : 0;
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
   * min", "trimmed to max", "dropped over max", or the rule or `otherwise`
   * that applied or skipped it.
   */
  rule: string;
};

/**
 * Decide which labels to add. A group gets labels only when it has none, so a
 * label that a template, a bot, or a person set always wins. Each label's
 * group rules, then its own, then its `otherwise` decide whether it passes,
 * with `otherwise: fits` passing at or above the threshold. Passing labels
 * over the group's `max` are trimmed to it, least likely first, or all dropped.
 * The most likely labels nothing skipped then fill the group to its `min`.
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
    const verdicts = new Map<ResolvedLabel, Verdict>(
      group.labels.map((label) => [
        label,
        decide(
          [...group.rules, ...label.rules],
          label.otherwise ?? group.otherwise ?? "fits",
          facts,
          { score: score(label), threshold: group.threshold },
          (i) =>
            i < group.rules.length
              ? `group rule ${i + 1}`
              : `label rule ${i - group.rules.length + 1}`,
        ),
      ]),
    );
    const outcome = (label: ResolvedLabel) => verdicts.get(label)?.outcome;
    // Labels a rule applies rank ahead of those that only passed.
    const ranked = [...group.labels].sort(
      (a, b) =>
        Number(outcome(b) === "apply") - Number(outcome(a) === "apply") ||
        score(b) - score(a),
    );
    const passing = ranked.filter(
      (label) => outcome(label) === "apply" || outcome(label) === "pass",
    );
    const over = group.max !== undefined && passing.length > group.max;
    const kept = new Set(
      over && group.overflow === "drop" ? [] : passing.slice(0, group.max),
    );
    const filled = new Set(
      ranked
        .filter((label) => !kept.has(label) && outcome(label) !== "skip")
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
            ? group.overflow === "drop"
              ? "dropped over max"
              : "trimmed to max"
            : (verdicts.get(label)?.why ?? ""),
      });
    }
  }
  return decisions;
}
