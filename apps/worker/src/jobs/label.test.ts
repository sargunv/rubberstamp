import type { Request, Response } from "@sargunv/rubberstamp-core";
import { describe, expect, it } from "vite-plus/test";

import type { Issue, RepoApi } from "../github/client.ts";
import type { CachedAnswer, LabelRun, Store } from "../store.ts";
import { runLabelJob, type LabelJob } from "./label.ts";

const CONFIG = `
context: A C API for MapLibre Native.
labels:
  groups:
    kind: { min: 1, max: 1, labels: [bug, feature] }
    area: { labels: ["area:*"] }
`;

class FakeRepo implements RepoApi {
  readonly fullName = "o/r";
  added: string[] = [];
  constructor(
    private readonly source: string | null,
    private readonly item: Issue,
    private readonly laterLabels: string[] = [],
  ) {}
  private reads = 0;
  config = async () => this.source;
  labels = async () => [
    { name: "bug", description: "Broken" },
    { name: "feature", description: "New" },
    { name: "area:map", description: "Maps" },
    { name: "area:docs", description: "Docs" },
  ];
  issue = async () => {
    this.reads++;
    const extra = this.reads > 1 ? this.laterLabels : [];
    return {
      ...this.item,
      labels: [...this.item.labels, ...extra.map((name) => ({ name }))],
    };
  };
  pullFiles = async () => [
    {
      filename: "src/map.cpp",
      status: "modified",
      additions: 3,
      deletions: 1,
      patch: "@@ -1 +1 @@\n-a\n+b",
    },
  ];
  addLabels = async (_: number, labels: string[]) => {
    this.added.push(...labels);
  };
}

class FakeStore implements Store {
  runs: LabelRun[] = [];
  answers: CachedAnswer[] = [];
  states = new Map<string, unknown>();
  spent = 0;
  hasLabelRun = async () => this.runs.length > 0;
  usage = async () => this.spent;
  globalSpent = 0;
  globalUsage = async () => this.globalSpent;
  addUsage = async (_: number, __: string, tokens: number) => {
    this.spent += tokens;
  };
  saveState = async (key: string, state: unknown) => {
    this.states.set(key, state);
  };
  saveLabelRun = async (run: LabelRun, answers: CachedAnswer[]) => {
    this.runs.push(run);
    this.answers.push(...answers);
  };
  recordLabelEvent = async () => {};
  saveInstallation = async () => {};
}

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

function jev(requests: Request[]) {
  return async (request: Request): Promise<Response> => {
    requests.push(request);
    return {
      model: "jev-1.13.0",
      usage: { input_tokens: 1000 },
      answers: {
        "group:kind": {
          type: "choice",
          choice: "bug",
          probabilities: { bug: 0.9, feature: 0.1 },
        },
        "label:area:map": { type: "noul", noul: 0.95 },
        "label:area:docs": { type: "noul", noul: 0.1 },
      },
    };
  };
}

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
      model: "jev-1.13.0",
      added: ["bug", "area:map"],
    });
    expect(store.answers).toHaveLength(3);
    expect(new Set(store.answers.map((a) => a.stateKey)).size).toBe(1);
    expect(store.states.size).toBe(1);
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
    repoId: 2,
    repo: "o/r",
    number: 3,
    stateKey: "",
    model: "",
    decisions: [],
    added: [],
    inputTokens: 0,
  };
}
