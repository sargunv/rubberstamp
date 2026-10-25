import { escape } from "minimatch";
import * as v from "valibot";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import { nameGlob } from "./glob.ts";

/** Where a repository keeps its Rubberstamp config. */
export const CONFIG_PATH = ".config/rubberstamp.yml";

/** The config version this code reads natively. Older ones are translated. */
export const CONFIG_VERSION = 1;

const Text = v.pipe(v.string(), v.trim(), v.nonEmpty());
const Threshold = v.pipe(v.number(), v.minValue(0), v.maxValue(1));
const Count = v.pipe(v.number(), v.integer(), v.minValue(0));
const Globs = v.pipe(v.array(Text), v.minLength(1));

// A shape picked by the input's own type, so errors name what's wrong with it
// rather than every shape it didn't match.
const isObject = (input: unknown) =>
  typeof input === "object" && input !== null && !Array.isArray(input);

const Ask = v.pipe(
  v.lazy((input) =>
    isObject(input)
      ? v.strictObject({ question: Text, threshold: v.optional(Threshold) })
      : Text,
  ),
  v.transform((ask) => (typeof ask === "string" ? { question: ask } : ask)),
);

const Fits = v.union(
  [v.literal(true), Threshold],
  "fits takes true or a threshold; negate it with unless",
);

const Condition = v.pipe(
  v.strictObject({
    is: v.optional(v.picklist(["issue", "pr"])),
    files: v.optional(Globs),
    ask: v.optional(Ask),
    fits: v.optional(Fits),
  }),
  v.check(
    (c) => Object.values(c).some((value) => value !== undefined),
    "a condition needs is, files, ask, or fits",
  ),
);

const Rules = v.optional(
  v.array(
    v.strictObject({
      if: v.optional(Condition),
      unless: v.optional(Condition),
      then: v.picklist(["apply", "skip"]),
    }),
  ),
  [],
);

const Otherwise = v.optional(v.picklist(["fits", "apply", "skip"]));

// A label is configured by its meaning alone, by nothing beyond the GitHub
// description, or by an object that can also hold rules.
const LabelValue = v.lazy((input) =>
  input === null
    ? v.null()
    : isObject(input)
      ? v.strictObject({
          meaning: v.optional(Text),
          rules: Rules,
          otherwise: Otherwise,
        })
      : Text,
);

type LabelValue = v.InferOutput<typeof LabelValue>;

export type LabelEntry = {
  /** A label name, or a pattern where `*` matches anything. */
  name: string;
  meaning?: string | undefined;
  rules: v.InferOutput<typeof Rules>;
  otherwise?: v.InferOutput<typeof Otherwise>;
};

const entry = (name: string, value: LabelValue): LabelEntry =>
  typeof value === "string"
    ? { name, meaning: value, rules: [] }
    : { name, rules: [], ...value };

// A list names labels in order, each by itself or as a one-key map of the name
// to its settings.
const LabelList = v.pipe(
  v.array(
    v.lazy((input) =>
      isObject(input)
        ? v.pipe(
            v.record(Text, LabelValue),
            v.check(
              (map) => Object.keys(map).length === 1,
              "a list item maps one label",
            ),
          )
        : Text,
    ),
  ),
  v.minLength(1),
  v.transform((items) =>
    items.flatMap((item) =>
      typeof item === "string"
        ? [entry(item, null)]
        : Object.entries(item).map(([name, value]) => entry(name, value)),
    ),
  ),
);

const LabelMap = v.pipe(
  v.record(Text, LabelValue),
  v.check((labels) => Object.keys(labels).length > 0, "name a label"),
  v.transform((labels) =>
    Object.entries(labels).map(([name, value]) => entry(name, value)),
  ),
);

const Labels = v.lazy((input) => (Array.isArray(input) ? LabelList : LabelMap));

const LabelGroup = v.pipe(
  v.strictObject({
    labels: Labels,
    min: v.optional(Count, 0),
    max: v.optional(v.pipe(Count, v.minValue(1))),
    overflow: v.optional(v.picklist(["trim", "drop"]), "trim"),
    guidance: v.optional(Text),
    threshold: v.optional(Threshold),
    rules: Rules,
    otherwise: Otherwise,
  }),
  v.forward(
    v.check(
      (group) => group.max === undefined || group.min <= group.max,
      "min must not exceed max",
    ),
    ["min"],
  ),
  v.forward(
    v.check(
      (group) =>
        group.overflow === "trim" ||
        (group.max !== undefined && group.min === 0),
      "overflow: drop needs a max and no min",
    ),
    ["overflow"],
  ),
);

const LabelsSection = v.strictObject({
  context: v.optional(Text),
  groups: v.record(Text, LabelGroup),
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
  threshold: v.optional(Threshold),
  rules: Rules,
  otherwise: Otherwise,
});

// The workflow file GitHub names as a run's path. Only its successes count as
// units passing, so another workflow at the same head can't stand in for it.
const WorkflowPath = v.pipe(
  v.string(),
  v.regex(
    /^\.github\/workflows\/[^/]+\.ya?ml$/,
    "name a workflow file such as .github/workflows/ci.yml",
  ),
);

const CiSection = v.strictObject({
  context: v.optional(Text),
  workflow: v.optional(WorkflowPath),
  threshold: v.optional(Threshold),
  units: v.pipe(
    v.record(UnitId, CiUnit),
    v.check((units) => Object.keys(units).length > 0, "name at least one unit"),
  ),
});

export const Config = v.strictObject({
  version: v.literal(CONFIG_VERSION, "version must be 1"),
  context: v.optional(Text),
  labels: v.optional(LabelsSection),
  ci: v.optional(CiSection),
});

export type Config = v.InferOutput<typeof Config>;
export type LabelGroupConfig = v.InferOutput<typeof LabelGroup>;
export type CiUnitConfig = v.InferOutput<typeof CiUnit>;

// Version 0, a config without `version`: labels described in their own map,
// and units forced to run by bare paths.
const ConfigV0 = v.strictObject({
  context: v.optional(Text),
  labels: v.optional(
    v.strictObject({
      context: v.optional(Text),
      groups: v.record(
        Text,
        v.strictObject({
          labels: Globs,
          min: v.optional(Count),
          max: v.optional(v.pipe(Count, v.minValue(1))),
          rule: v.optional(Text),
          threshold: v.optional(Threshold),
        }),
      ),
      describe: v.optional(v.record(Text, Text), {}),
    }),
  ),
  ci: v.optional(
    v.strictObject({
      context: v.optional(Text),
      workflow: v.optional(WorkflowPath),
      threshold: v.optional(Threshold),
      units: v.record(
        UnitId,
        v.strictObject({
          covers: Text,
          paths: v.optional(v.array(Text), []),
          threshold: v.optional(Threshold),
        }),
      ),
    }),
  ),
});

type ConfigV0 = v.InferOutput<typeof ConfigV0>;
type Document = { [key: string]: unknown };

const defined = (entries: [string, unknown][]): Document =>
  Object.fromEntries(entries.filter(([, value]) => value !== undefined));

/**
 * A version 0 config as the version 1 document that means the same. Each
 * described label moves into the first group with a pattern matching it, which
 * is the group that version 0 gave it to.
 */
/**
 * A version 0 path pattern, whose `*` matched across `/`, as version 1 path
 * globs. A whole-segment `*` becomes `**`, and a trailing `*` also matches
 * what's under it. A `*` inside a middle segment now stops at `/`.
 */
function upgradeGlob(pattern: string): string[] {
  const upgraded = pattern
    .split("/")
    .map((segment) =>
      segment === "*"
        ? "**"
        : segment
            .split("*")
            .map((part) => escape(part))
            .join("*"),
    )
    .join("/");
  return upgraded.endsWith("*") && !upgraded.endsWith("**")
    ? [upgraded, `${upgraded}/**`]
    : [upgraded];
}

function upgradeV0(old: ConfigV0): Document {
  const labels = old.labels;
  const groups = Object.entries(labels?.groups ?? {}).map(
    ([id, group]) => [id, group, new Map<string, unknown>()] as const,
  );
  for (const [, group, entries] of groups) {
    for (const name of group.labels) entries.set(name, null);
  }
  for (const [name, meaning] of Object.entries(labels?.describe ?? {})) {
    const owner = groups.find(([, group]) =>
      group.labels.some((pattern) =>
        nameGlob(pattern, { ignoreCase: true })(name),
      ),
    );
    if (!owner) continue;
    const entries = owner[2];
    const key =
      [...entries.keys()].find((k) => k.toLowerCase() === name.toLowerCase()) ??
      name;
    entries.set(key, meaning);
  }
  return defined([
    ["version", CONFIG_VERSION],
    ["context", old.context],
    [
      "labels",
      labels &&
        defined([
          ["context", labels.context],
          [
            "groups",
            Object.fromEntries(
              groups.map(([id, group, entries]) => [
                id,
                defined([
                  [
                    "labels",
                    [...entries.values()].every((e) => e === null)
                      ? group.labels
                      : Object.fromEntries(entries),
                  ],
                  ["min", group.min],
                  ["max", group.max],
                  ["guidance", group.rule],
                  ["threshold", group.threshold],
                ]),
              ]),
            ),
          ],
        ]),
    ],
    [
      "ci",
      old.ci &&
        defined([
          ["context", old.ci.context],
          ["workflow", old.ci.workflow],
          ["threshold", old.ci.threshold],
          [
            "units",
            Object.fromEntries(
              Object.entries(old.ci.units).map(([id, unit]) => [
                id,
                defined([
                  ["covers", unit.covers],
                  ["threshold", unit.threshold],
                  [
                    "rules",
                    unit.paths.length > 0
                      ? [
                          {
                            if: { files: unit.paths.flatMap(upgradeGlob) },
                            then: "apply",
                          },
                        ]
                      : undefined,
                  ],
                ]),
              ]),
            ),
          ],
        ]),
    ],
  ]);
}

export type ConfigResult =
  | {
      ok: true;
      config: Config;
      /** The version 1 equivalent, when the source is an older version. */
      upgraded?: string;
    }
  | { ok: false; errors: string[] };

function issues(issues: v.BaseIssue<unknown>[]): string[] {
  return issues.map((issue) => {
    const path = v.getDotPath(issue);
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}

export function parseConfig(source: string): ConfigResult {
  let document: unknown;
  try {
    document = parseYaml(source);
  } catch (error) {
    return { ok: false, errors: [`Invalid YAML: ${String(error)}`] };
  }
  document ??= {};
  const versioned =
    typeof document === "object" && document !== null && "version" in document;
  if (versioned) {
    const result = v.safeParse(Config, document);
    if (result.success) return { ok: true, config: result.output };
    return { ok: false, errors: issues(result.issues) };
  }
  const old = v.safeParse(ConfigV0, document);
  if (!old.success) return { ok: false, errors: issues(old.issues) };
  const upgraded = upgradeV0(old.output);
  const result = v.safeParse(Config, upgraded);
  // Checks that span fields, such as min against max, run on the upgrade.
  if (!result.success) return { ok: false, errors: issues(result.issues) };
  return {
    ok: true,
    config: result.output,
    upgraded: stringifyYaml(upgraded, { lineWidth: 80 }),
  };
}
