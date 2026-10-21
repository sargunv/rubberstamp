import * as v from "valibot";
import { parse as parseYaml } from "yaml";

/** Where a repository keeps its Rubberstamp config. */
export const CONFIG_PATH = ".config/rubberstamp.yml";

/**
 * Also read, after CONFIG_PATH, for repositories that adopted Rubberstamp
 * before it moved. Not documented anywhere users see.
 */
export const LEGACY_CONFIG_PATH = ".github/rubberstamp.yml";

const Text = v.pipe(v.string(), v.trim(), v.nonEmpty());
const Threshold = v.pipe(v.number(), v.minValue(0), v.maxValue(1));
const Count = v.pipe(v.number(), v.integer(), v.minValue(0));

const LabelGroup = v.pipe(
  v.strictObject({
    labels: v.pipe(v.array(Text), v.minLength(1)),
    min: v.optional(Count, 0),
    max: v.optional(v.pipe(Count, v.minValue(1))),
    rule: v.optional(Text),
    threshold: v.optional(Threshold),
  }),
  v.forward(
    v.check(
      (group) => group.max === undefined || group.min <= group.max,
      "min must not exceed max",
    ),
    ["min"],
  ),
);

const LabelsSection = v.strictObject({
  context: v.optional(Text),
  groups: v.record(Text, LabelGroup),
  describe: v.optional(v.record(Text, Text), {}),
});

export const Config = v.strictObject({
  context: v.optional(Text),
  labels: v.optional(LabelsSection),
});

export type Config = v.InferOutput<typeof Config>;
export type LabelGroupConfig = v.InferOutput<typeof LabelGroup>;

export type ConfigResult =
  | { ok: true; config: Config }
  | { ok: false; errors: string[] };

export function parseConfig(source: string): ConfigResult {
  let document: unknown;
  try {
    document = parseYaml(source);
  } catch (error) {
    return { ok: false, errors: [`Invalid YAML: ${String(error)}`] };
  }
  const result = v.safeParse(Config, document ?? {});
  if (result.success) return { ok: true, config: result.output };
  return {
    ok: false,
    errors: result.issues.map((issue) => {
      const path = v.getDotPath(issue);
      return path ? `${path}: ${issue.message}` : issue.message;
    }),
  };
}
