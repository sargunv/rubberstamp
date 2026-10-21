import { describe, expect, it } from "vite-plus/test";

import {
  changedPaths,
  ciUnits,
  decideUnits,
  everyUnit,
  planRequests,
  unitScores,
  type Change,
} from "./ci.ts";
import { parseConfig, type Config } from "./config.ts";

const SOURCE = `
context: A C API for MapLibre Native.
ci:
  context: Linux x64 runs every test suite.
  threshold: 0.6
  units:
    linux-x64:
      covers: Linux x64 with every binding's tests.
    macos:
      covers: macOS with Metal.
      paths: [src/platform/apple/*]
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
      { "unit:linux-x64": { type: "noul", noul: 0.2 } },
      {
        "unit:linux-x64": { type: "noul", noul: 0.6 },
        "unit:macos": { type: "noul", noul: 0.1 },
      },
    ]);
    expect(decideUnits(units, scores, ["src/map.cpp"])).toEqual([
      { unit: "linux-x64", threshold: 0.6, run: true, score: 0.6, rule: "" },
      { unit: "macos", threshold: 0.3, run: false, score: 0.1, rule: "" },
    ]);
  });

  it("forces a unit whose paths match a changed file, renames included", () => {
    const paths = changedPaths([
      {
        ...FILE,
        filename: "src/platform/darwin/map.mm",
        previous_filename: "src/platform/apple/map.mm",
        status: "renamed",
      },
    ]);
    expect(decideUnits(units, { macos: 0.05 }, paths)[1]).toEqual({
      unit: "macos",
      threshold: 0.3,
      run: true,
      score: 0.05,
      rule: "matches src/platform/apple/*",
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
});
