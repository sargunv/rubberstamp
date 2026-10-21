import type { Request } from "@sargunv/rubberstamp-core";
import { describe, expect, it } from "vite-plus/test";

import type { Issue, ListedItem } from "../github/client.ts";
import { CONFIG, FakeRepo, jev } from "../testing.ts";
import { buildPreview } from "./build.ts";

const unused: Issue = { title: "", body: null, state: "open", labels: [] };

function listed(overrides: Partial<ListedItem>): ListedItem {
  return {
    number: 1,
    title: "Map tiles flicker",
    body: null,
    state: "open",
    user: { login: "someone" },
    created_at: "2026-10-20T00:00:00Z",
    html_url: "https://github.com/o/r/issues/1",
    labels: [],
    ...overrides,
  };
}

describe("buildPreview", () => {
  it("labels the newest items as if they had none, without writing to GitHub", async () => {
    const repo = new FakeRepo(
      CONFIG,
      unused,
      [],
      [
        listed({
          number: 2,
          title: "Fix camera",
          state: "closed",
          labels: [{ name: "feature" }],
          pull_request: { merged_at: "2026-10-20T01:00:00Z" },
        }),
        listed({ number: 1, state: "closed", state_reason: "not_planned" }),
      ],
    );
    const requests: Request[] = [];
    const result = await buildPreview({
      repo,
      ask: jev(requests),
      model: "jev-latest",
      count: 20,
      now: () => new Date("2026-10-21T00:00:00Z"),
    });

    expect(repo.added).toEqual([]);
    expect(requests).toHaveLength(2);
    if (!result.ok) throw new Error(result.error);
    const { preview } = result;
    expect(preview).toMatchObject({
      repo: "o/r",
      createdAt: "2026-10-21T00:00:00.000Z",
      model: "jev-1.13.0",
      inputTokens: 2000,
    });
    expect(preview.labels[0]).toEqual({
      name: "bug",
      description: "Broken",
      color: "d73a4a",
    });
    const [pull, issue] = preview.items;
    expect(pull).toMatchObject({ state: "merged", labels: ["feature"] });
    expect(issue).toMatchObject({ state: "not planned", type: "issue" });
    // The existing feature label doesn't stop Rubberstamp choosing bug.
    expect(pull?.decisions.filter((d) => d.add).map((d) => d.label)).toEqual([
      "bug",
      "area:map",
    ]);
  });

  it("explains why it can't preview", async () => {
    const build = (source: string | null) =>
      buildPreview({
        repo: new FakeRepo(source, unused),
        ask: jev([]),
        model: "m",
        count: 20,
      });
    expect(await build(null)).toEqual({ ok: false, error: "No config file" });
    expect(await build("labels: 3")).toMatchObject({ ok: false });
    expect(await build("context: hi")).toEqual({
      ok: false,
      error: "Labeling is off",
    });
  });
});
