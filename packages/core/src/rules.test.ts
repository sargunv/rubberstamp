import { describe, expect, it } from "vite-plus/test";

import { firstRule, ruleText } from "./rules.ts";

describe("ruleText", () => {
  it("puts a rule in words", () => {
    expect(
      ruleText({
        if: { kind: "pr", files: ["docs/*", "*.md"] },
        unless: { ask: "Is it only a typo?", threshold: 0.3 },
        then: "skip",
      }),
    ).toBe(
      "Skip if it's a pull request and a changed file matches docs/*, *.md " +
        "unless Jev answers yes (0.30) to “Is it only a typo?”",
    );
    expect(ruleText({ then: "apply" })).toBe("Apply");
  });
});

describe("firstRule", () => {
  it("takes the first rule whose if holds and whose unless doesn't", () => {
    const facts = { kind: "pr" as const, paths: ["a.md"], asks: { q: 0.5 } };
    const name = (i: number) => `rule ${i + 1}`;
    expect(
      firstRule(
        [
          { if: { kind: "issue" }, then: "apply" },
          { unless: { ask: "q" }, then: "skip" },
          { if: { files: ["*.txt", "*.md"] }, then: "apply" },
          { then: "skip" },
        ],
        facts,
        name,
      ),
    ).toEqual({ then: "apply", why: "rule 3, matching *.md" });
    expect(
      firstRule([{ unless: { ask: "missing" }, then: "skip" }], facts, name),
    ).toEqual({
      then: "skip",
      why: "rule 1",
    });
    expect(firstRule([], facts, name)).toBeUndefined();
  });
});
