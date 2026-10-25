import { glob } from "./glob.ts";
import type { Answer, Question } from "./jev.ts";

export type Kind = "issue" | "pr";

/** Holds when every key it sets holds. */
export type Condition = {
  kind?: Kind | undefined;
  files?: string[] | undefined;
  ask?: string | undefined;
  threshold?: number | undefined;
};

export type Rule = {
  if?: Condition | undefined;
  unless?: Condition | undefined;
  then: "apply" | "skip";
};

/** What rules are judged on. An issue has no paths. */
export type Facts = {
  kind: Kind;
  paths: string[];
  /** Jev's probability for each asked question, keyed by its text. */
  asks: Record<string, number>;
};

export const DEFAULT_ASK_THRESHOLD = 0.5;

/**
 * Whether the rules decide every item, because one has no condition. A score
 * they'd override isn't worth asking for.
 */
export function alwaysDecides(rules: Rule[]): boolean {
  return rules.some(
    (rule) => rule.if === undefined && rule.unless === undefined,
  );
}

/** The questions the rules ask, each once, in the order they first appear. */
export function ruleAsks(rules: Rule[]): string[] {
  const asks = rules.flatMap((rule) =>
    [rule.if?.ask, rule.unless?.ask].filter((ask) => ask !== undefined),
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
): { holds: boolean; matched?: string } {
  if (condition.kind !== undefined && condition.kind !== facts.kind) {
    return { holds: false };
  }
  if (condition.ask !== undefined) {
    const threshold = condition.threshold ?? DEFAULT_ASK_THRESHOLD;
    if ((facts.asks[condition.ask] ?? 0) < threshold) return { holds: false };
  }
  if (condition.files === undefined) return { holds: true };
  const matched = condition.files.find((pattern) =>
    facts.paths.some(glob(pattern)),
  );
  return matched === undefined ? { holds: false } : { holds: true, matched };
}

export type Verdict = { then: Rule["then"]; why: string };

/**
 * The first rule whose `if` holds and whose `unless` doesn't, or undefined
 * when none does. `name` labels each rule by its position in the list.
 */
export function firstRule(
  rules: Rule[],
  facts: Facts,
  name: (index: number) => string,
): Verdict | undefined {
  for (const [index, rule] of rules.entries()) {
    const when =
      rule.if === undefined ? { holds: true } : check(rule.if, facts);
    if (!when.holds) continue;
    if (rule.unless !== undefined && check(rule.unless, facts).holds) continue;
    const why = name(index);
    return {
      then: rule.then,
      why:
        when.matched === undefined ? why : `${why}, matching ${when.matched}`,
    };
  }
  return undefined;
}

function conditionText(condition: Condition): string {
  const parts: string[] = [];
  if (condition.kind !== undefined) {
    parts.push(
      condition.kind === "pr" ? "it's a pull request" : "it's an issue",
    );
  }
  if (condition.files !== undefined) {
    parts.push(`a changed file matches ${condition.files.join(", ")}`);
  }
  if (condition.ask !== undefined) {
    const threshold = condition.threshold ?? DEFAULT_ASK_THRESHOLD;
    parts.push(
      `Jev answers yes (${threshold.toFixed(2)}) to “${condition.ask}”`,
    );
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
