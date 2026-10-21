import * as v from "valibot";
import { parse as parseYaml } from "yaml";

/** Where a repository keeps its Rubberstamp config. */
export const CONFIG_PATH = ".config/rubberstamp.yml";

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

// Workflows gate jobs on unit ids with GitHub's `contains`, which ignores case,
// so ids are lowercase to keep two of them from matching the same job.
const UnitId = v.pipe(
  v.string(),
  v.regex(
    /^[a-z0-9][a-z0-9._-]*$/,
    "unit ids use lowercase letters, digits, '.', '_', and '-'",
  ),
);

const CiUnit = v.strictObject({
  covers: Text,
  paths: v.optional(v.array(Text), []),
  threshold: v.optional(Threshold),
});

const CiSection = v.strictObject({
  context: v.optional(Text),
  threshold: v.optional(Threshold),
  units: v.pipe(
    v.record(UnitId, CiUnit),
    v.check((units) => Object.keys(units).length > 0, "name at least one unit"),
  ),
});

export const Config = v.strictObject({
  context: v.optional(Text),
  labels: v.optional(LabelsSection),
  ci: v.optional(CiSection),
});

export type Config = v.InferOutput<typeof Config>;
export type LabelGroupConfig = v.InferOutput<typeof LabelGroup>;
export type CiUnitConfig = v.InferOutput<typeof CiUnit>;

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
