import { describe, expect, it } from "vite-plus/test";

import { chunk, describeItem, filePatch, fileList } from "./describe.ts";
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
