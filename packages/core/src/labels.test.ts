import { describe, expect, it } from "vite-plus/test";

import { parseConfig, type Config } from "./config.ts";
import type { Item } from "./describe.ts";
import type { Answer } from "./jev.ts";
import { labelFacts, labelRequest } from "./labeling.ts";
import {
  decideLabels,
  labelScores,
  NONE,
  resolveLabels,
  type RepoLabel,
} from "./labels.ts";
import type { Facts } from "./rules.ts";

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

const ISSUE: Facts = { kind: "issue", paths: [], asks: {} };

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

  it("warns about missing labels and duplicates", () => {
    const { groups, warnings } = resolveLabels(
      config(`
version: 1
labels:
  groups:
    a:
      labels:
        bug: ~
        "platform:*": ~
        nope: Not a label.
    b: { labels: [bug, chore] }
`),
      REPO_LABELS,
    );
    expect(groups.map((g) => g.labels.map((l) => l.name))).toEqual([
      ["bug"],
      ["chore"],
    ]);
    expect(warnings).toEqual([
      'Group a: no repository label matches "platform:*".',
      'Group a: no repository label matches "nope".',
      "Label bug is in groups a and b; it stays in a.",
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
      guidance: "Only when specific to this binding.",
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
  const added = (present: string[]) =>
    decideLabels(groups, scores, present, ISSUE)
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
    const decisions = decideLabels(capped, scores, [], ISSUE);
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
});

describe("rules", () => {
  const RULES = `
version: 1
labels:
  groups:
    area:
      min: 1
      labels:
        "area:*": ~
        area:docs:
          rules: [{ then: skip }]
    binding:
      labels:
        "binding:*": ~
        binding:kotlin:
          meaning: The Kotlin binding, from the config.
          rules:
            - { if: { files: [bindings/kotlin/*] }, then: apply }
      rules:
        - if: { kind: pr }
          unless: { ask: &specific Is this about particular bindings?, threshold: 0.3 }
          then: skip
        - { if: { kind: issue }, unless: { ask: *specific }, then: skip }
`;
  const { groups } = resolveLabels(config(RULES), REPO_LABELS);
  const scores = {
    "area:map": 0.1,
    "area:render": 0.2,
    "Area:Docs": 0.9,
    "binding:kotlin": 0.2,
    "binding:swift": 0.8,
  };
  const pr: Item = {
    type: "pull request",
    title: "",
    body: null,
    files: [
      {
        filename: "bindings/kotlin/a.kt",
        status: "modified",
        additions: 1,
        deletions: 0,
      },
    ],
  };
  const decide = (item: Item, specific: number) => {
    const request = labelRequest(config(RULES), groups, item, "m");
    expect(
      Object.keys(request.questions).filter((k) => k.startsWith("ask:")),
    ).toEqual(["ask:1"]);
    const facts = labelFacts(groups, item, {
      "ask:1": { type: "noul", noul: specific },
    });
    return decideLabels(groups, scores, [], facts)
      .filter((d) => d.add || d.rule)
      .map(
        (d) => `${d.add ? "+" : "-"}${d.label}${d.rule ? ` (${d.rule})` : ""}`,
      );
  };

  it("doesn't ask about a label that its rules always decide", () => {
    const decided = resolveLabels(
      config(`
version: 1
labels:
  groups:
    kind: { min: 1, max: 1, labels: [bug, feature] }
    binding:
      labels:
        binding:kotlin: { rules: [{ then: skip }] }
        binding:swift: ~
`),
      REPO_LABELS,
    ).groups;
    const request = labelRequest(
      config(),
      decided,
      { type: "issue", title: "", body: null },
      "m",
    );
    expect(Object.keys(request.questions)).toEqual([
      "group:kind",
      "label:binding:swift",
    ]);
  });

  it("takes a label's exact entry over its pattern's", () => {
    const kotlin = groups[1]?.labels.find((l) => l.name === "binding:kotlin");
    expect(kotlin).toMatchObject({
      meaning: "The Kotlin binding, from the config.",
      fromConfig: true,
    });
    expect(
      groups[1]?.labels.find((l) => l.name === "binding:swift")?.fromConfig,
    ).toBe(false);
  });

  it("checks group rules before label rules, and never fills with a skipped label", () => {
    expect(decide(pr, 0.4)).toEqual([
      "+area:render (filled to min)",
      "-Area:Docs (label rule 1)",
      "+binding:kotlin (label rule 1, matching bindings/kotlin/*)",
      "+binding:swift",
    ]);
    expect(decide(pr, 0.2)).toEqual([
      "+area:render (filled to min)",
      "-Area:Docs (label rule 1)",
      "-binding:kotlin (group rule 1)",
      "-binding:swift (group rule 1)",
    ]);
  });

  it("judges issues by their own rules and never matches files on them", () => {
    const issue: Item = { type: "issue", title: "", body: null };
    expect(decide(issue, 0.4)).toEqual([
      "+area:render (filled to min)",
      "-Area:Docs (label rule 1)",
      "-binding:kotlin (group rule 2)",
      "-binding:swift (group rule 2)",
    ]);
    expect(decide(issue, 0.6)).toEqual([
      "+area:render (filled to min)",
      "-Area:Docs (label rule 1)",
      "+binding:swift",
    ]);
  });

  it("adds none of a group's labels when more pass than max with over: none", () => {
    const capped = resolveLabels(
      config(`
version: 1
labels:
  groups:
    binding: { labels: ["binding:*"], max: 1, over: none, threshold: 0.1 }
`),
      REPO_LABELS,
    ).groups;
    expect(
      decideLabels(capped, scores, [], ISSUE).map((d) => [
        d.label,
        d.add,
        d.rule,
      ]),
    ).toEqual([
      ["binding:kotlin", false, "over max"],
      ["binding:swift", false, "over max"],
    ]);
  });
});
