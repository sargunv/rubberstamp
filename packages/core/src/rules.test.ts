import { describe, expect, it } from "vite-plus/test";

import { decide, ruleText, type Facts } from "./rules.ts";

describe("ruleText", () => {
  it("puts a rule in words", () => {
    expect(
      ruleText({
        if: { is: "pr", files: ["docs/**", "*.md"], fits: 0.8 },
        unless: { ask: { question: "Is it only a typo?", threshold: 0.3 } },
        then: "skip",
      }),
    ).toBe(
      "Skip if it's a pull request and a changed file matches docs/**, *.md " +
        "and it fits at 0.80 unless Jev answers yes (0.30) to “Is it only a typo?”",
    );
    expect(ruleText({ if: { fits: true }, then: "apply" })).toBe(
      "Apply if it fits",
    );
  });
});

describe("decide", () => {
  const facts: Facts = {
    is: "pr",
    paths: ["docs/guide/a.md", ".github/ci.yml"],
    asks: { q: 0.5 },
  };
  const target = { score: 0.7, threshold: 0.65 };
  const name = (i: number) => `rule ${i + 1}`;

  it("takes the first rule whose if holds and whose unless doesn't", () => {
    expect(
      decide(
        [
          { if: { is: "issue" }, then: "apply" },
          { unless: { ask: { question: "q" } }, then: "skip" },
          { if: { files: ["*.md", "docs/**"] }, then: "apply" },
        ],
        "skip",
        facts,
        target,
        name,
      ),
    ).toEqual({ outcome: "apply", why: "rule 3, matching docs/**" });
  });

  it("matches paths as GitHub Actions does", () => {
    const matches = (pattern: string) =>
      decide(
        [{ if: { files: [pattern] }, then: "apply" }],
        "skip",
        facts,
        target,
        name,
      ).outcome === "apply";
    expect(matches("docs/*")).toBe(false);
    expect(matches("docs/**")).toBe(true);
    expect(matches(".github/*")).toBe(true);
    expect(matches("**/*.md")).toBe(true);
  });

  it("falls to otherwise, which by default compares the score", () => {
    expect(decide([], "fits", facts, target, name)).toEqual({
      outcome: "pass",
      why: "",
    });
    expect(decide([], "fits", facts, { ...target, score: 0.6 }, name)).toEqual({
      outcome: "fail",
      why: "",
    });
    expect(decide([], "skip", facts, target, name)).toEqual({
      outcome: "skip",
      why: "otherwise: skip",
    });
  });

  it("checks fits against the target's threshold or its own", () => {
    const rule = (fits: true | number) =>
      decide([{ if: { fits }, then: "apply" }], "skip", facts, target, name)
        .outcome;
    expect(rule(true)).toBe("apply");
    expect(rule(0.8)).toBe("skip");
  });
});
