import { describe, expect, it } from "vite-plus/test";

import { parseConfig, type Config } from "./config.ts";
import type { Answer } from "./jev.ts";
import { labelRequest } from "./labeling.ts";
import {
  decideLabels,
  labelScores,
  NONE,
  resolveLabels,
  type RepoLabel,
} from "./labels.ts";

const REPO_LABELS: RepoLabel[] = [
  { name: "bug", description: "Something is broken" },
  { name: "feature", description: "A new capability" },
  { name: "chore", description: "Maintenance" },
  { name: "area:map", description: "Maps, styles, and the camera" },
  { name: "area:render", description: "Rendering backends" },
  { name: "Area:Docs", description: null },
  { name: "binding:kotlin", description: "The Kotlin binding" },
  { name: "binding:swift", description: "The Swift binding" },
  { name: "good first issue", description: "Good for newcomers" },
];

const SOURCE = `
context: |
  A C API for MapLibre Native,
  wrapped by bindings.
labels:
  groups:
    kind: { pick: one, required: true, labels: [bug, feature, chore] }
    area: { required: true, labels: ["area:*"] }
    binding:
      labels: ["binding:*"]
      rule: Only when specific to this binding.
      threshold: 0.7
  describe:
    area:docs: The documentation as the subject.
`;

function config(source = SOURCE): Config {
  const result = parseConfig(source);
  if (!result.ok) throw new Error(result.errors.join("\n"));
  return result.config;
}

describe("parseConfig", () => {
  it("reports schema errors with their paths", () => {
    const result = parseConfig(
      "labels:\n  groups:\n    kind: { pick: two, labels: [] }\n",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(
      result.errors.some((e) => e.startsWith("labels.groups.kind.pick")),
    ).toBe(true);
    expect(
      result.errors.some((e) => e.startsWith("labels.groups.kind.labels")),
    ).toBe(true);
  });

  it("rejects unknown keys", () => {
    expect(parseConfig("lables: {}\n").ok).toBe(false);
  });

  it("accepts an empty file", () => {
    expect(parseConfig("").ok).toBe(true);
  });
});

describe("resolveLabels", () => {
  it("matches patterns case-insensitively and prefers describe overrides", () => {
    const { groups, warnings } = resolveLabels(config(), REPO_LABELS);
    expect(groups.map((g) => [g.id, g.labels.map((l) => l.name)])).toEqual([
      ["kind", ["bug", "feature", "chore"]],
      ["area", ["area:map", "area:render", "Area:Docs"]],
      ["binding", ["binding:kotlin", "binding:swift"]],
    ]);
    const docs = groups[1]?.labels[2];
    expect(docs?.meaning).toBe("The documentation as the subject.");
    expect(warnings).toEqual([]);
  });

  it("defaults thresholds by pick", () => {
    const { groups } = resolveLabels(config(), REPO_LABELS);
    expect(groups.map((g) => g.threshold)).toEqual([0.5, 0.8, 0.7]);
  });

  it("warns about missing labels, duplicates, and stray descriptions", () => {
    const { groups, warnings } = resolveLabels(
      config(`
labels:
  groups:
    a: { labels: [bug, "platform:*"] }
    b: { labels: [bug, chore] }
  describe:
    nope: Not a label.
`),
      REPO_LABELS,
    );
    expect(groups.map((g) => g.labels.map((l) => l.name))).toEqual([
      ["bug"],
      ["chore"],
    ]);
    expect(warnings).toEqual([
      'Group a: no repository label matches "platform:*".',
      "Label bug is in groups a and b; it stays in a.",
      "describe.nope names a label that is in no group.",
    ]);
  });
});

describe("labelRequest", () => {
  it("asks one choice per pick-one group and one noul per other label", () => {
    const { groups } = resolveLabels(config(), REPO_LABELS);
    const request = labelRequest(
      config(),
      groups,
      { type: "issue", title: "Crash", body: "It crashes." },
      "jev-latest",
    );
    expect(Object.keys(request.questions)).toEqual([
      "group:kind",
      "label:area:map",
      "label:area:render",
      "label:Area:Docs",
      "label:binding:kotlin",
      "label:binding:swift",
    ]);
    expect(request.state).toEqual({
      repository: "A C API for MapLibre Native, wrapped by bindings.",
      item: { type: "issue", title: "Crash", body: "It crashes." },
    });
    const kind = request.questions["group:kind"];
    expect(kind?.type === "choice" && Object.keys(kind.criteria)).toEqual([
      "bug",
      "feature",
      "chore",
    ]);
    expect(
      request.questions["label:binding:kotlin"]?.instructions,
    ).toMatchObject({
      rule: "Only when specific to this binding.",
    });
  });

  it("offers a no-match option to optional pick-one groups", () => {
    const { groups } = resolveLabels(
      config(
        "labels:\n  groups:\n    kind: { pick: one, labels: [bug, chore] }\n",
      ),
      REPO_LABELS,
    );
    const request = labelRequest(
      config(),
      groups,
      { type: "issue", title: "", body: null },
      "m",
    );
    const kind = request.questions["group:kind"];
    expect(kind?.type === "choice" && Object.keys(kind.criteria)).toEqual([
      "bug",
      "chore",
      NONE,
    ]);
  });
});

describe("decideLabels", () => {
  const { groups } = resolveLabels(config(), REPO_LABELS);
  const answers: Record<string, Answer> = {
    "group:kind": {
      type: "choice",
      choice: "bug",
      probabilities: { bug: 0.7, feature: 0.2, chore: 0.1 },
    },
    "label:area:map": { type: "noul", noul: 0.6 },
    "label:area:render": { type: "noul", noul: 0.3 },
    "label:Area:Docs": { type: "noul", noul: 0.1 },
    "label:binding:kotlin": { type: "noul", noul: 0.75 },
    "label:binding:swift": { type: "noul", noul: 0.2 },
  };
  const scores = labelScores(groups, answers);
  const added = (present: string[], thresholds = {}) =>
    decideLabels(groups, scores, present, thresholds)
      .filter((d) => d.add)
      .map((d) => `${d.label}${d.rule ? ` (${d.rule})` : ""}`);

  it("adds passing labels and the most likely label of a required group", () => {
    expect(added([])).toEqual([
      "bug",
      "area:map (most likely)",
      "binding:kotlin",
    ]);
  });

  it("leaves groups alone that already have a label", () => {
    expect(added(["Feature", "binding:swift"])).toEqual([
      "area:map (most likely)",
    ]);
  });

  it("applies threshold overrides per group", () => {
    expect(added([], { kind: 0.8, area: 0.5, binding: 0.9 })).toEqual([
      "bug (most likely)",
      "area:map",
    ]);
  });
});
