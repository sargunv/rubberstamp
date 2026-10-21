import type { Request } from "@sargunv/rubberstamp-core";
import { describe, expect, it } from "vite-plus/test";

import type { Issue, RepoApi } from "../github/client.ts";
import type { LabelRun } from "../store.ts";
import { CONFIG, FakeRepo, FakeStore, jev } from "../testing.ts";
import { runLabelJob, type LabelJob } from "./label.ts";

const job: LabelJob = {
  type: "label",
  installationId: 1,
  repoId: 2,
  repo: "o/r",
  number: 3,
};
const pull: Issue = {
  title: "Fix camera",
  body: "Fixes #1",
  state: "open",
  labels: [],
  pull_request: {},
};

describe("runLabelJob", () => {
  it("judges a pull request with its diff and adds the chosen labels", async () => {
    const repo = new FakeRepo(CONFIG, pull);
    const store = new FakeStore();
    const requests: Request[] = [];
    const outcome = await runLabelJob(job, {
      repo,
      store,
      ask: jev(requests),
      model: "jev-latest",
      budget: { installation: 10_000, global: 100_000 },
    });

    expect(outcome.status).toBe("labeled");
    expect(repo.added).toEqual(["bug", "area:map"]);
    expect(JSON.stringify(requests[0]?.state)).toContain(
      "M src/map.cpp (+3 -1)",
    );
    expect(store.spent).toBe(1000);
    expect(store.runs[0]).toMatchObject({
      installationId: 1,
      model: "jev-1.13.0",
      added: ["bug", "area:map"],
    });
    // The log keeps the groups as judged, so a later config can't rewrite it.
    expect(store.runs[0]?.groups.map((g) => [g.id, g.threshold])).toEqual([
      ["kind", 0.5],
      ["area", 0.8],
    ]);
  });

  it("respects labels someone set while Jev judged", async () => {
    const repo = new FakeRepo(CONFIG, pull, ["feature"]);
    await runLabelJob(job, {
      repo,
      store: new FakeStore(),
      ask: jev([]),
      model: "m",
      budget: { installation: 10_000, global: 100_000 },
    });
    expect(repo.added).toEqual(["area:map"]);
  });

  it("skips without config, with invalid config, when judged, or over budget", async () => {
    const options = (repo: RepoApi, store = new FakeStore()) => ({
      repo,
      store,
      ask: jev([]),
      model: "m",
      budget: { installation: 10_000, global: 100_000 },
    });
    expect(await runLabelJob(job, options(new FakeRepo(null, pull)))).toEqual({
      status: "skipped",
      reason: "no config",
    });
    expect(
      await runLabelJob(job, options(new FakeRepo("labels: 3", pull))),
    ).toMatchObject({ reason: "invalid config" });

    const judged = new FakeStore();
    judged.runs.push(storeRun());
    expect(
      await runLabelJob(job, options(new FakeRepo(CONFIG, pull), judged)),
    ).toMatchObject({ reason: "already judged" });

    const spent = new FakeStore();
    spent.spent = 10_000;
    expect(
      await runLabelJob(job, options(new FakeRepo(CONFIG, pull), spent)),
    ).toMatchObject({ reason: "monthly budget spent" });

    const global = new FakeStore();
    global.globalSpent = 100_000;
    expect(
      await runLabelJob(job, options(new FakeRepo(CONFIG, pull), global)),
    ).toMatchObject({ reason: "global budget spent" });
  });
});

function storeRun(): LabelRun {
  return {
    installationId: 1,
    repoId: 2,
    repo: "o/r",
    number: 3,
    title: "",
    type: "issue",
    model: "",
    groups: [],
    decisions: [],
    added: [],
    inputTokens: 0,
  };
}
