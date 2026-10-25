import { changedPaths } from "./ci.ts";
import type { Config } from "./config.ts";
import { contextText, describeItem, type Item } from "./describe.ts";
import type { Answer, Json, Request } from "./jev.ts";
import { labelAsks, labelQuestions, type ResolvedGroup } from "./labels.ts";
import { askQuestionKey, type Facts } from "./rules.ts";

export function labelState(config: Config, item: Item): Json {
  const context = contextText(config.context, config.labels?.context);
  return {
    ...(context === undefined ? {} : { repository: context }),
    item: describeItem(item),
  };
}

export function labelRequest(
  config: Config,
  groups: ResolvedGroup[],
  item: Item,
  model: string,
): Request {
  return {
    model,
    state: labelState(config, item),
    questions: labelQuestions(groups),
  };
}

/** What label rules judge an item on. A question left unanswered scores 0. */
export function labelFacts(
  groups: ResolvedGroup[],
  item: Item,
  answers: Record<string, Answer>,
): Facts {
  const asks = labelAsks(groups);
  return {
    kind: item.type === "issue" ? "issue" : "pr",
    paths: item.type === "issue" ? [] : changedPaths(item.files),
    asks: Object.fromEntries(
      asks.map((ask) => {
        const answer = answers[askQuestionKey(asks, ask)];
        return [ask, answer?.type === "noul" ? answer.noul : 0];
      }),
    ),
  };
}
