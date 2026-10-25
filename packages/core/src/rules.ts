import { pathGlob } from "./glob.ts";
import type { Answer, Question } from "./jev.ts";

export type Kind = "issue" | "pr";

/** Holds when every key it sets holds. */
export type Condition = {
  is?: Kind | undefined;
  files?: string[] | undefined;
  ask?: { question: string; threshold?: number | undefined } | undefined;
  /** `true` for the target's own threshold, or a threshold of its own. */
  fits?: true | number | undefined;
};

export type Rule = {
  if?: Condition | undefined;
  unless?: Condition | undefined;
  then: "apply" | "skip";
};

/** What decides a label or unit when none of its rules match. */
export type Otherwise = "fits" | "apply" | "skip";

/** What rules are judged on. An issue has no paths. */
export type Facts = {
  is: Kind;
  paths: string[];
  /** Jev's probability for each asked question, keyed by its text. */
  asks: Record<string, number>;
};

/** The label or unit being decided: its built-in question's score and bar. */
export type Target = { score: number; threshold: number };

export const DEFAULT_ASK_THRESHOLD = 0.5;

/** The questions the rules ask, each once, in the order they first appear. */
export function ruleAsks(rules: Rule[]): string[] {
  const asks = rules.flatMap((rule) =>
    [rule.if?.ask?.question, rule.unless?.ask?.question].filter(
      (ask) => ask !== undefined,
    ),
  );
  return [...new Set(asks)];
}

export function askQuestionKey(asks: string[], ask: string): string {
  return `ask:${asks.indexOf(ask) + 1}`;
}

export function askQuestions(asks: string[]): Record<string, Question> {
  return Object.fromEntries(
    asks.map((ask) => [
      askQuestionKey(asks, ask),
      {
        type: "noul",
        instructions: { question: ask },
        criteria: {
          true: "Yes, for this work.",
          false: "No, or the question doesn't concern this work.",
        },
      } satisfies Question,
    ]),
  );
}

/**
 * Each question's probability: the highest any request gave it. Null when any
 * request lacks an answer, since a missing answer isn't a no.
 */
export function askScores(
  asks: string[],
  answers: Record<string, Answer>[],
): Record<string, number> | null {
  const scores: Record<string, number> = {};
  for (const ask of asks) {
    let highest = 0;
    for (const chunk of answers) {
      const answer = chunk[askQuestionKey(asks, ask)];
      if (answer?.type !== "noul") return null;
      highest = Math.max(highest, answer.noul);
    }
    scores[ask] = highest;
  }
  return scores;
}

/** Whether a condition holds, and the first pattern a changed path matched. */
function check(
  condition: Condition,
  facts: Facts,
  target: Target,
): { holds: boolean; matched?: string } {
  if (condition.is !== undefined && condition.is !== facts.is) {
    return { holds: false };
  }
  if (condition.ask !== undefined) {
    const { question, threshold = DEFAULT_ASK_THRESHOLD } = condition.ask;
    if ((facts.asks[question] ?? 0) < threshold) return { holds: false };
  }
  if (condition.fits !== undefined) {
    const threshold =
      condition.fits === true ? target.threshold : condition.fits;
    if (target.score < threshold) return { holds: false };
  }
  if (condition.files === undefined) return { holds: true };
  const matched = condition.files.find((pattern) =>
    facts.paths.some(pathGlob(pattern)),
  );
  return matched === undefined ? { holds: false } : { holds: true, matched };
}

/**
 * How a label or unit came out: applied or skipped by a rule or `otherwise`,
 * or passed or failed its built-in question when `otherwise` is `fits`.
 */
export type Verdict = {
  outcome: "apply" | "skip" | "pass" | "fail";
  /** The rule or `otherwise` that decided, or "" when the score did. */
  why: string;
};

/**
 * Check the rules in order: the first whose `if` holds and whose `unless`
 * doesn't decides. When none does, `otherwise` decides. `name` labels each
 * rule by its position in the list.
 */
export function decide(
  rules: Rule[],
  otherwise: Otherwise,
  facts: Facts,
  target: Target,
  name: (index: number) => string,
): Verdict {
  for (const [index, rule] of rules.entries()) {
    const when =
      rule.if === undefined ? { holds: true } : check(rule.if, facts, target);
    if (!when.holds) continue;
    if (rule.unless !== undefined && check(rule.unless, facts, target).holds) {
      continue;
    }
    const why = name(index);
    return {
      outcome: rule.then,
      why:
        when.matched === undefined ? why : `${why}, matching ${when.matched}`,
    };
  }
  if (otherwise !== "fits") {
    return { outcome: otherwise, why: `otherwise: ${otherwise}` };
  }
  return {
    outcome: target.score >= target.threshold ? "pass" : "fail",
    why: "",
  };
}

function conditionText(condition: Condition): string {
  const parts: string[] = [];
  if (condition.is !== undefined) {
    parts.push(condition.is === "pr" ? "it's a pull request" : "it's an issue");
  }
  if (condition.files !== undefined) {
    parts.push(`a changed file matches ${condition.files.join(", ")}`);
  }
  if (condition.fits !== undefined) {
    parts.push(
      condition.fits === true
        ? "it fits"
        : `it fits at ${condition.fits.toFixed(2)}`,
    );
  }
  if (condition.ask !== undefined) {
    const { question, threshold = DEFAULT_ASK_THRESHOLD } = condition.ask;
    parts.push(`Jev answers yes (${threshold.toFixed(2)}) to “${question}”`);
  }
  return parts.join(" and ");
}

/** A rule in words, such as "Skip unless it's a pull request". */
export function ruleText(rule: Rule): string {
  const then = rule.then === "apply" ? "Apply" : "Skip";
  const clauses = [
    rule.if === undefined ? "" : ` if ${conditionText(rule.if)}`,
    rule.unless === undefined ? "" : ` unless ${conditionText(rule.unless)}`,
  ];
  return then + clauses.join("");
}
