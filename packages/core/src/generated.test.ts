import { describe, expect, it } from "vite-plus/test";

import { attributeDirs, generatedMatcher } from "./generated.ts";

describe("attributeDirs", () => {
  it("lists every ancestor directory once, shallowest first", () => {
    expect(attributeDirs(["a/b/c.ts", "a/d.ts", "e.ts"])).toEqual([
      "",
      "a",
      "a/b",
    ]);
  });
});

describe("generatedMatcher", () => {
  const generated = generatedMatcher([
    {
      dir: "",
      source: [
        "# Generated",
        "*.lock linguist-generated=true",
        "/gen/** linguist-generated",
        "gen/keep.ts -linguist-generated",
        "docs/ linguist-generated",
        "*.ts text eol=lf",
      ].join("\n"),
    },
    {
      dir: "bindings",
      source:
        "/dotnet/*.g.cs linguist-generated=true\nCargo.lock linguist-generated=false\n",
    },
  ]);

  it("matches names at any depth, and paths from the file's directory", () => {
    expect(generated("deep/down/x.lock")).toBe(true);
    expect(generated("gen/a/b.ts")).toBe(true);
    expect(generated("src/gen/a.ts")).toBe(false);
    expect(generated("bindings/dotnet/Api.g.cs")).toBe(true);
    expect(generated("dotnet/Api.g.cs")).toBe(false);
    expect(generated("bindings/dotnet/sub/Api.g.cs")).toBe(false);
  });

  it("lets a later line or a deeper file unset it", () => {
    expect(generated("gen/keep.ts")).toBe(false);
    expect(generated("bindings/rust/Cargo.lock")).toBe(false);
  });

  it("ignores directory patterns and other attributes", () => {
    expect(generated("docs/index.md")).toBe(false);
    expect(generated("src/a.ts")).toBe(false);
  });
});
