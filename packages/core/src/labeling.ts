import type { Config } from "./config.ts";
import { contextText, describeItem, type Item } from "./describe.ts";
import type { Json, Request } from "./jev.ts";
import { labelQuestions, type ResolvedGroup } from "./labels.ts";

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
