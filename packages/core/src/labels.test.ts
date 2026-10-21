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
    kind: { min: 1, max: 1, labels: [bug, feature, chore] }
    area: { min: 1, labels: ["area:*"] }
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
      "labels:\n  groups:\n    kind: { max: two, labels: [] }\n",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(
      result.errors.some((e) => e.startsWith("labels.groups.kind.max")),
    ).toBe(true);
    expect(
      result.errors.some((e) => e.startsWith("labels.groups.kind.labels")),
    ).toBe(true);
  });

  it("checks min and max", () => {
    const errors = (group: string) => {
      const result = parseConfig(`labels:\n  groups:\n    g: ${group}\n`);
      return result.ok ? [] : result.errors;
    };
    expect(errors("{ labels: [a], min: 2, max: 1 }")).toEqual([
      "labels.groups.g.min: min must not exceed max",
    ]);
    expect(errors("{ labels: [a], max: 0 }")).toHaveLength(1);
    expect(errors("{ labels: [a], min: 1.5 }")).toHaveLength(1);
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

  it("defaults thresholds by question type", () => {
    const { groups } = resolveLabels(config(), REPO_LABELS);
    expect(groups.map((g) => g.threshold)).toEqual([0.5, 0.5, 0.7]);
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
  it("asks one choice for a max-one group and one noul per other label", () => {
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

  it("offers a no-match option when a choice group has no min", () => {
    const { groups } = resolveLabels(
      config(
        "labels:\n  groups:\n    kind: { max: 1, labels: [bug, chore] }\n",
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

describe("question type", () => {
  it("asks a noul for a lone label even with max 1", () => {
    const { groups } = resolveLabels(
      config("labels:\n  groups:\n    up: { max: 1, labels: [bug] }\n"),
      REPO_LABELS,
    );
    expect(groups[0]).toMatchObject({ choice: false, threshold: 0.5 });
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
    "label:area:map": { type: "noul", noul: 0.45 },
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

  it("adds passing labels and fills groups to their min", () => {
    expect(added([])).toEqual([
      "bug",
      "area:map (filled to min)",
      "binding:kotlin",
    ]);
  });

  it("leaves groups alone that already have a label", () => {
    expect(added(["Feature", "binding:swift"])).toEqual([
      "area:map (filled to min)",
    ]);
  });

  it("fills and cuts noul groups to their min and max", () => {
    const capped = resolveLabels(
      config(`
labels:
  groups:
    area: { labels: ["area:*"], min: 2, threshold: 0.9 }
    binding: { labels: ["binding:*"], max: 1, threshold: 0.1 }
`),
      REPO_LABELS,
    ).groups;
    const decisions = decideLabels(capped, scores, []);
    expect(
      decisions.filter((d) => d.add || d.rule).map((d) => [d.label, d.rule]),
    ).toEqual([
      ["area:map", "filled to min"],
      ["area:render", "filled to min"],
      ["binding:kotlin", ""],
      ["binding:swift", "cut by max"],
    ]);
    expect(decisions.find((d) => d.label === "binding:swift")?.add).toBe(false);
  });

  it("warns when a group cannot reach its min", () => {
    expect(
      resolveLabels(
        config(
          'labels:\n  groups:\n    b: { labels: ["binding:*"], min: 3 }\n',
        ),
        REPO_LABELS,
      ).warnings,
    ).toEqual(["Group b needs 3 labels but only 2 exist."]);
  });

  it("applies threshold overrides per group", () => {
    expect(added([], { kind: 0.8, area: 0.4, binding: 0.9 })).toEqual([
      "bug (filled to min)",
      "area:map",
    ]);
  });
});
