import * as v from "valibot";
import { parse as parseYaml } from "yaml";

export const CONFIG_PATH = ".github/docket.yml";

const Text = v.pipe(v.string(), v.trim(), v.nonEmpty());
const Threshold = v.pipe(v.number(), v.minValue(0), v.maxValue(1));

const LabelGroup = v.strictObject({
  labels: v.pipe(v.array(Text), v.minLength(1)),
  pick: v.optional(v.picklist(["one", "any"]), "any"),
  required: v.optional(v.boolean(), false),
  rule: v.optional(Text),
  threshold: v.optional(Threshold),
});

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
