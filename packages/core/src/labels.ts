import type { Config } from "./config.ts";
import { squash } from "./describe.ts";
import type { Answer, Json, Question } from "./jev.ts";

export type RepoLabel = { name: string; description: string | null };

export type ResolvedLabel = { name: string; meaning: string };

export type ResolvedGroup = {
  id: string;
  pick: "one" | "any";
  required: boolean;
  rule: string | undefined;
  threshold: number;
  labels: ResolvedLabel[];
};

export type Resolution = { groups: ResolvedGroup[]; warnings: string[] };

const DEFAULT_THRESHOLD = { one: 0.5, any: 0.8 };
export const NONE = "none of these";

function matcher(pattern: string): (name: string) => boolean {
  const escaped = pattern
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  const regex = new RegExp(`^${escaped}$`, "i");
  return (name) => regex.test(name);
}

/** Match the configured groups against the labels that exist on the repo. */
export function resolveLabels(
  config: Config,
  repoLabels: RepoLabel[],
): Resolution {
  const section = config.labels;
  if (!section) return { groups: [], warnings: [] };
  const warnings: string[] = [];
  const describe = new Map(
    Object.entries(section.describe).map(([name, text]) => [
      name.toLowerCase(),
      text,
    ]),
  );
  const claimed = new Map<string, string>();
  const groups: ResolvedGroup[] = [];

  for (const [id, group] of Object.entries(section.groups)) {
    const labels: ResolvedLabel[] = [];
    for (const pattern of group.labels) {
      const matches = repoLabels.filter((label) =>
        matcher(pattern)(label.name),
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
        const meaning = describe.get(key) ?? label.description ?? "";
        if (!meaning.trim()) {
          warnings.push(
            `Label ${label.name} has no description, so Jev sees only its name.`,
          );
        }
        labels.push({ name: label.name, meaning: squash(meaning) });
      }
    }
    if (labels.length === 0) continue;
    groups.push({
      id,
      pick: group.pick,
      required: group.required,
      rule: group.rule === undefined ? undefined : squash(group.rule),
      threshold: group.threshold ?? DEFAULT_THRESHOLD[group.pick],
      labels,
    });
  }

  for (const name of describe.keys()) {
    if (!claimed.has(name)) {
      warnings.push(`describe.${name} names a label that is in no group.`);
    }
  }
  return { groups, warnings };
}

export function groupQuestionKey(group: ResolvedGroup): string {
  return `group:${group.id}`;
}

export function labelQuestionKey(label: ResolvedLabel): string {
  return `label:${label.name}`;
}

export function labelQuestions(
  groups: ResolvedGroup[],
): Record<string, Question> {
  const questions: Record<string, Question> = {};
  for (const group of groups) {
    const rule: Record<string, Json> = group.rule ? { rule: group.rule } : {};
    if (group.pick === "one") {
      const criteria: Record<string, Json> = Object.fromEntries(
        group.labels.map((label) => [label.name, label.meaning || label.name]),
      );
      if (!group.required) {
        criteria[NONE] = "None of these labels describes this work.";
      }
      questions[groupQuestionKey(group)] = {
        type: "choice",
        instructions: {
          question:
            "Which label best describes this issue or pull request? Judge the " +
            "work it reports, requests, or makes, not the files it touches.",
          ...rule,
        },
        criteria,
      };
      continue;
    }
    for (const label of group.labels) {
      questions[labelQuestionKey(label)] = {
        type: "noul",
        instructions: {
          question:
            `Should this issue or pull request get the \`${label.name}\` ` +
            "label? A maintainer searching for that label would expect to " +
            "find it.",
          label: label.meaning || label.name,
          ...rule,
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
  return questions;
}

/** Each label's probability, keyed by label name. */
export type Scores = Record<string, number>;

export function labelScores(
  groups: ResolvedGroup[],
  answers: Record<string, Answer>,
): Scores {
  const scores: Scores = {};
  for (const group of groups) {
    if (group.pick === "one") {
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
  rule: "" | "present" | "group labeled" | "most likely";
};

/**
 * Decide which labels to add. A group gets labels only when it has none, so a
 * label that a template, a bot, or a person set always wins.
 */
export function decideLabels(
  groups: ResolvedGroup[],
  scores: Scores,
  present: Iterable<string>,
  thresholds: Record<string, number> = {},
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
    const threshold = thresholds[group.id] ?? group.threshold;
    const best = group.labels.reduce((a, b) => (score(b) > score(a) ? b : a));
    let passing = group.labels.filter((label) => score(label) >= threshold);
    if (group.pick === "one") passing = passing.includes(best) ? [best] : [];
    const fallback = group.required && passing.length === 0;
    for (const label of group.labels) {
      const chosen = fallback && label === best;
      decisions.push({
        label: label.name,
        group: group.id,
        add: chosen || passing.includes(label),
        score: score(label),
        rule: chosen ? "most likely" : "",
      });
    }
  }
  return decisions;
}
