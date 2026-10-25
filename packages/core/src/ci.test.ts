import { describe, expect, it } from "vite-plus/test";

import {
  changedPaths,
  changedSince,
  ciUnits,
  decideUnits,
  everyUnit,
  noUnit,
  planRequests,
  unitAsks,
  unitScores,
  type Change,
} from "./ci.ts";
import { parseConfig, type Config } from "./config.ts";
import { askScores } from "./rules.ts";

const SOURCE = `
version: 1
context: A C API for MapLibre Native.
ci:
  context: Linux x64 runs every test suite.
  threshold: 0.6
  units:
    linux-x64:
      covers: Linux x64 with every binding's tests.
    macos:
      covers: macOS with Metal.
      rules: [{ if: { files: [src/platform/apple/*] }, then: apply }]
      threshold: 0.3
`;

function config(source = SOURCE): Config {
  const result = parseConfig(source);
  if (!result.ok) throw new Error(result.errors.join("\n"));
  return result.config;
}

function change(files: Change["files"]): Change {
  return { title: "Fix the camera", body: "Fixes #1", files };
}

const FILE = {
  filename: "src/map.cpp",
  status: "modified",
  additions: 1,
  deletions: 1,
  patch: "@@ -1 +1 @@\n-a\n+b",
};

describe("ciUnits", () => {
  it("resolves each unit's threshold from the unit, the section, or the default", () => {
    expect(ciUnits(config()).map((u) => [u.id, u.threshold])).toEqual([
      ["linux-x64", 0.6],
      ["macos", 0.3],
    ]);
    expect(
      ciUnits(config("ci:\n  units:\n    docs: { covers: Docs }\n"))[0]
        ?.threshold,
    ).toBe(0.5);
    expect(ciUnits(config("context: Nothing\n"))).toEqual([]);
  });
});

describe("planRequests", () => {
  it("asks one question per unit about the change and both contexts", () => {
    const units = ciUnits(config());
    const [request, ...rest] =
      planRequests(config(), units, change([FILE]), "jev-latest") ?? [];
    expect(rest).toEqual([]);
    expect(Object.keys(request?.questions ?? {})).toEqual([
      "unit:linux-x64",
      "unit:macos",
    ]);
    expect(request?.state).toMatchObject({
      repository:
        "A C API for MapLibre Native.\n\nLinux x64 runs every test suite.",
      change: {
        title: "Fix the camera",
        body: "Fixes #1",
        files: ["M src/map.cpp (+1 -1)"],
      },
    });
    expect(JSON.stringify(request?.state)).toContain("+b");
  });

  it("splits a long patch into parts and gives up past eight", () => {
    const units = ciUnits(config());
    const big = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        ...FILE,
        filename: `src/${i}.cpp`,
        patch: "+x\n".repeat(7_000),
      }));
    const requests = planRequests(config(), units, change(big(6)), "m") ?? [];
    expect(requests.length).toBeGreaterThan(1);
    expect(JSON.stringify(requests[1]?.state)).toContain(
      `Part 2 of ${requests.length} of the patch`,
    );
    expect(planRequests(config(), units, change(big(40)), "m")).toBeNull();
  });
});

describe("decideUnits", () => {
  const units = ciUnits(config());

  it("runs units at or above their threshold, using each unit's highest score", () => {
    const scores = unitScores(units, [
      {
        "unit:linux-x64": { type: "noul", noul: 0.2 },
        "unit:macos": { type: "noul", noul: 0.1 },
      },
      {
        "unit:linux-x64": { type: "noul", noul: 0.6 },
        "unit:macos": { type: "noul", noul: 0.05 },
      },
    ]);
    expect(decideUnits(units, scores ?? {}, {}, ["src/map.cpp"])).toEqual([
      { unit: "linux-x64", threshold: 0.6, run: true, score: 0.6, rule: "" },
      { unit: "macos", threshold: 0.3, run: false, score: 0.1, rule: "" },
    ]);
  });

  it("has no scores when any chunk leaves a unit unanswered", () => {
    expect(
      unitScores(units, [
        {
          "unit:linux-x64": { type: "noul", noul: 0.6 },
          "unit:macos": { type: "noul", noul: 0.1 },
        },
        { "unit:linux-x64": { type: "noul", noul: 0.6 } },
      ]),
    ).toBeNull();
  });

  it("skips a unit when its rule's question falls short, whatever its score", () => {
    const gated = ciUnits(
      config(`
version: 1
ci:
  units:
    docs:
      covers: The docs site.
      rules: [{ unless: { ask: Does this change the docs?, threshold: 0.4 }, then: skip }]
`),
    );
    const [request] = planRequests(config(), gated, change([FILE]), "m") ?? [];
    expect(Object.keys(request?.questions ?? {})).toEqual([
      "unit:docs",
      "ask:1",
    ]);
    const answers = [
      {
        "unit:docs": { type: "noul", noul: 0.9 },
        "ask:1": { type: "noul", noul: 0.1 },
      },
      {
        "unit:docs": { type: "noul", noul: 0.9 },
        "ask:1": { type: "noul", noul: 0.3 },
      },
    ] as const;
    const asks = askScores(unitAsks(gated), [...answers]);
    expect(asks).toEqual({ "Does this change the docs?": 0.3 });
    expect(decideUnits(gated, { docs: 0.9 }, asks ?? {}, [])).toEqual([
      { unit: "docs", threshold: 0.5, run: false, score: 0.9, rule: "rule 1" },
    ]);
    expect(
      decideUnits(
        gated,
        { docs: 0.9 },
        { "Does this change the docs?": 0.4 },
        [],
      )[0]?.run,
    ).toBe(true);
  });

  it("applies a unit whose rule matches a changed file, renames included", () => {
    const paths = changedPaths([
      {
        ...FILE,
        filename: "src/platform/darwin/map.mm",
        previous_filename: "src/platform/apple/map.mm",
        status: "renamed",
      },
    ]);
    expect(decideUnits(units, { macos: 0.05 }, {}, paths)[1]).toEqual({
      unit: "macos",
      threshold: 0.3,
      run: true,
      score: 0.05,
      rule: "rule 1, matching src/platform/apple/*",
    });
  });

  it("runs every unit without scores when a rule decides", () => {
    expect(everyUnit(units, "too large to judge")).toEqual([
      {
        unit: "linux-x64",
        threshold: 0.6,
        run: true,
        score: null,
        rule: "too large to judge",
      },
      {
        unit: "macos",
        threshold: 0.3,
        run: true,
        score: null,
        rule: "too large to judge",
      },
    ]);
  });

  it("records the pass a unit was judged since, and skips by rule", () => {
    expect(decideUnits(units, { macos: 0.5 }, {}, [], "abc123")[1]).toEqual({
      unit: "macos",
      threshold: 0.3,
      run: true,
      score: 0.5,
      rule: "",
      since: "abc123",
    });
    expect(noUnit(units, "no changes since abc123", "abc123")[0]).toEqual({
      unit: "linux-x64",
      threshold: 0.6,
      run: false,
      score: null,
      rule: "no changes since abc123",
      since: "abc123",
    });
  });
});

describe("changedSince", () => {
  const file = (filename: string, patch: string) => ({
    ...FILE,
    filename,
    patch,
  });

  it("finds nothing when every patch is the same", () => {
    const patch = "@@ -20,3 +20,3 @@ void f() {\n x\n-a\n+b\n y";
    expect(
      changedSince([file("a.cpp", patch)], [file("a.cpp", patch)]),
    ).toEqual([]);
  });

  it("lists a file whose same edit moved to another hunk", () => {
    const now = file("a.cpp", "@@ -40,2 +40,3 @@ void g() {\n z\n+log();\n w");
    expect(
      changedSince(
        [now],
        [file("a.cpp", "@@ -10,2 +10,3 @@ void f() {\n x\n+log();\n y")],
      ),
    ).toEqual([now]);
  });

  it("lists a file whose changes were edited, as it is now", () => {
    const now = file("b.cpp", "@@ -1 +1 @@\n-a\n+c");
    expect(
      changedSince(
        [file("a.cpp", "@@ -1 +1 @@\n-a\n+b"), now],
        [
          file("a.cpp", "@@ -1 +1 @@\n-a\n+b"),
          file("b.cpp", "@@ -1 +1 @@\n-a\n+b"),
        ],
      ),
    ).toEqual([now]);
  });

  it("lists a file added since, and one the pull request reverted", () => {
    const added = file("new.cpp", "@@ -0,0 +1 @@\n+x");
    expect(
      changedSince(
        [added],
        [
          {
            ...file("gone.cpp", "@@ -1 +1 @@\n-a\n+b"),
            previous_filename: "old.cpp",
            status: "renamed",
          },
        ],
      ),
    ).toEqual([
      added,
      {
        filename: "gone.cpp",
        previous_filename: "old.cpp",
        status: "reverted",
        additions: 0,
        deletions: 0,
      },
    ]);
  });

  it("can't compare a file without a patch on either side", () => {
    const binary = { ...FILE, patch: undefined };
    expect(changedSince([binary], [FILE])).toBeNull();
    expect(changedSince([FILE], [binary])).toBeNull();
  });
});

describe("planRequests since a pass", () => {
  it("says what it covers and lists reverted files without a patch", () => {
    const [request] =
      planRequests(
        config(),
        ciUnits(config()),
        {
          ...change([
            FILE,
            {
              filename: "src/gone.cpp",
              status: "reverted",
              additions: 0,
              deletions: 0,
            },
          ]),
          since: "abcdef1234",
        },
        "m",
      ) ?? [];
    expect(request?.state).toMatchObject({
      change: {
        scope: expect.stringContaining("at commit abcdef1, where"),
        files: [
          "M src/map.cpp (+1 -1)",
          "src/gone.cpp (reverted: the pull request no longer changes it)",
        ],
      },
    });
    expect(JSON.stringify(request?.state)).not.toContain("b/src/gone.cpp");
  });
});
