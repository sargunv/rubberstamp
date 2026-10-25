import { describe, expect, it } from "vite-plus/test";

import {
  chunk,
  describeItem,
  filePatch,
  fileList,
  narrowContext,
} from "./describe.ts";
import { canonicalJson, hashJson } from "./hash.ts";

describe("filePatch", () => {
  it("writes a git-style header for renames", () => {
    expect(
      filePatch({
        filename: "b.ts",
        previous_filename: "a.ts",
        status: "renamed",
        additions: 1,
        deletions: 0,
        patch: "@@ -1 +1 @@\n-a\n+b",
      }),
    ).toBe(
      "diff --git a/a.ts b/b.ts\nrename from a.ts\nrename to b.ts\n@@ -1 +1 @@\n-a\n+b\n",
    );
  });

  it("summarizes lockfiles and notes missing patches", () => {
    const lock = filePatch({
      filename: "pnpm-lock.yaml",
      status: "modified",
      additions: 9000,
      deletions: 0,
      patch: "+x\n".repeat(5000),
    });
    expect(lock.length).toBeLessThan(3_200);
    expect(lock).toContain("more lines of this file's diff omitted");
    expect(
      filePatch({
        filename: "a.png",
        status: "added",
        additions: 0,
        deletions: 0,
      }),
    ).toContain("[no textual diff");
  });
});

describe("chunk", () => {
  it("packs patches within the budget", () => {
    expect(chunk(["aaa", "bbb", "cc"], 6)).toEqual(["aaabbb", "cc"]);
    expect(chunk([], 6)).toEqual([""]);
    expect(chunk(["aaaaaaaa"], 4)).toEqual(["aaaa"]);
  });
});

describe("describeItem", () => {
  it("lists files and keeps the first chunk of a large diff", () => {
    const files = Array.from({ length: 4 }, (_, index) => ({
      filename: `src/${index}.ts`,
      status: "modified",
      additions: 1,
      deletions: 1,
      patch: "+".repeat(20_000),
    }));
    const described = describeItem({
      type: "pull request",
      title: "t",
      body: null,
      files,
    });
    expect(described["files"]).toEqual(
      files.map((f) => `M ${f.filename} (+1 -1)`),
    );
    expect(described["patch"]).toMatch(/the rest of the diff is omitted\]\n$/);
  });

  it("names submodule moves in the file list", () => {
    expect(
      fileList([
        {
          filename: "third_party/maplibre-native",
          status: "modified",
          additions: 1,
          deletions: 1,
          patch:
            "@@ -1 +1 @@\n-Subproject commit b18b5efff6dfb9868489be36100bed6093c7d396\n+Subproject commit 6f75ff093780c4bffa34a4474cf2506028f659f1",
        },
      ]),
    ).toEqual(["M third_party/maplibre-native (submodule b18b5ef → 6f75ff0)"]);
  });

  it("caps the file list", () => {
    const files = Array.from({ length: 2000 }, (_, index) => ({
      filename: `some/long/directory/name/file-${index}.ts`,
      status: "added",
      additions: 1,
      deletions: 0,
    }));
    const listed = fileList(files);
    expect(listed.at(-1)).toMatch(/^\.\.\. and \d+ more changed files$/);
  });
});

describe("hashJson", () => {
  it("ignores key order", async () => {
    expect(canonicalJson({ b: 1, a: [true, null] })).toBe(
      '{"a":[true,null],"b":1}',
    );
    expect(await hashJson({ a: 1, b: 2 })).toBe(await hashJson({ b: 2, a: 1 }));
  });
});

describe("generated files", () => {
  const file = (filename: string, generated?: boolean) => ({
    filename,
    status: "modified",
    additions: 1,
    deletions: 1,
    patch: "+x\n".repeat(5000),
    ...(generated === undefined ? {} : { generated }),
  });

  it("lists and diffs them after the files written by hand", () => {
    const files = [file("src/api.g.cs", true), file("src/a.ts")];
    expect(fileList(files)).toEqual([
      "M src/a.ts (+1 -1)",
      "M src/api.g.cs (+1 -1, generated)",
    ]);
    const patch = JSON.stringify(
      describeItem({ type: "pull request", title: "t", body: null, files })[
        "patch"
      ],
    );
    expect(patch.indexOf("src/a.ts")).toBeLessThan(
      patch.indexOf("src/api.g.cs"),
    );
  });

  it("shows only the start of each one", () => {
    const patch = filePatch(file("src/api.g.cs", true));
    expect(patch).toContain("generated file\n");
    expect(patch.length).toBeLessThan(3_200);
  });
});

describe("narrowContext", () => {
  it("keeps the context around each change and splits hunks between", () => {
    const patch = [
      "@@ -10,8 +10,8 @@ function camera() {",
      " a",
      " b",
      "-c",
      "+C",
      " d",
      " e",
      " f",
      " g",
      "-h",
      "+H",
      "\\ No newline at end of file",
    ].join("\n");
    expect(narrowContext(patch, 1)).toBe(
      [
        "@@ -11,3 +11,3 @@ function camera() {",
        " b",
        "-c",
        "+C",
        " d",
        "@@ -16,2 +16,2 @@",
        " g",
        "-h",
        "+H",
        "\\ No newline at end of file",
      ].join("\n"),
    );
    expect(narrowContext(patch, 3)).toBe(patch);
  });

  it("leaves a patch without hunks alone", () => {
    expect(narrowContext("+x\n+y", 1)).toBe("+x\n+y");
  });
});

describe("fileList with generated files counted", () => {
  it("lists the files written by hand and counts the rest", () => {
    const file = (filename: string, generated: boolean) => ({
      filename,
      status: "modified",
      additions: 2,
      deletions: 1,
      generated,
    });
    expect(
      fileList(
        [file("a.g.cs", true), file("a.ts", false), file("b.g.cs", true)],
        {
          generated: "count",
        },
      ),
    ).toEqual(["M a.ts (+2 -1)", "... and 2 generated files (+4 -2)"]);
  });
});
