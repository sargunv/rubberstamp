import type { Request, Response } from "@sargunv/rubberstamp-core";
import { describe, expect, it } from "vite-plus/test";

import type { Issue } from "../github/client.ts";
import { FakeRepo, FakeStore } from "../testing.ts";
import { runPlanJob, type PlanDeps, type PlanJob } from "./plan.ts";

const CONFIG = `
context: A C API for MapLibre Native.
ci:
  units:
    linux-x64: { covers: Linux x64 with every binding's tests. }
    macos:
      covers: macOS with Metal.
      paths: [src/platform/apple/*]
`;

const job: PlanJob = {
  type: "plan",
  installationId: 1,
  repoId: 2,
  repo: "o/r",
  number: 3,
  head: "abc123",
  base: "main",
};

const pull: Issue = {
  title: "Fix camera",
  body: "Fixes #1",
  state: "open",
  labels: [],
  pull_request: {},
};

/** Jev that wants Linux and not macOS, and records requests. */
function jev(requests: Request[]) {
  return async (request: Request): Promise<Response> => {
    requests.push(request);
    return {
      model: "jev-1.13.0",
      usage: { input_tokens: 1000 },
      answers: {
        "unit:linux-x64": { type: "noul", noul: 0.9 },
        "unit:macos": { type: "noul", noul: 0.2 },
      },
    };
  };
}

function deps(
  repo: FakeRepo,
  store: FakeStore,
  overrides: Partial<PlanDeps> = {},
): PlanDeps {
  return {
    repo,
    store,
    ask: jev([]),
    model: "jev-latest",
    budget: { installation: 10_000, global: 100_000 },
    ...overrides,
  };
}

describe("runPlanJob", () => {
  it("plans units from Jev's scores and records the plan and its usage", async () => {
    const store = new FakeStore();
    const requests: Request[] = [];
    const outcome = await runPlanJob(
      job,
      deps(new FakeRepo(CONFIG, pull), store, { ask: jev(requests) }),
    );

    expect(outcome).toEqual({
      status: "planned",
      decisions: [
        { unit: "linux-x64", threshold: 0.5, run: true, score: 0.9, rule: "" },
        { unit: "macos", threshold: 0.5, run: false, score: 0.2, rule: "" },
      ],
    });
    expect(JSON.stringify(requests[0]?.state)).toContain(
      "M src/map.cpp (+3 -1)",
    );
    expect(store.usageKinds).toEqual(["ci"]);
    expect(store.plans[0]).toMatchObject({
      number: 3,
      title: "Fix camera",
      head: "abc123",
      base: "base123",
      model: "jev-1.13.0",
      inputTokens: 1000,
    });
  });

  it("forces a unit whose paths match a changed file", async () => {
    const repo = new FakeRepo(CONFIG, pull);
    repo.files = [
      {
        filename: "src/platform/apple/map.mm",
        status: "modified",
        additions: 1,
        deletions: 1,
      },
    ];
    const outcome = await runPlanJob(job, deps(repo, new FakeStore()));
    expect(outcome.status === "planned" && outcome.decisions[1]).toMatchObject({
      unit: "macos",
      run: true,
      rule: "matches src/platform/apple/*",
    });
  });

  it("skips a head that's planned or that a later push replaced", async () => {
    const store = new FakeStore();
    const repo = new FakeRepo(CONFIG, pull);
    await runPlanJob(job, deps(repo, store));
    expect(await runPlanJob(job, deps(repo, store))).toMatchObject({
      reason: "already planned",
    });
    repo.head = "def456";
    expect(
      await runPlanJob({ ...job, head: "older" }, deps(repo, store)),
    ).toMatchObject({ reason: "superseded" });
    expect(store.plans).toHaveLength(1);
  });

  it("skips when a push lands while it reads the files", async () => {
    const repo = new FakeRepo(CONFIG, pull);
    const files = repo.pullFiles;
    repo.pullFiles = async () => {
      repo.head = "def456";
      return files();
    };
    const store = new FakeStore();
    expect(await runPlanJob(job, deps(repo, store))).toMatchObject({
      reason: "superseded",
    });
    expect(store.plans).toEqual([]);
  });

  it("plans again when the pull request is retargeted at the same head", async () => {
    const store = new FakeStore();
    const repo = new FakeRepo(CONFIG, pull);
    await runPlanJob(job, deps(repo, store));
    repo.base = "release";
    await runPlanJob({ ...job, base: "release" }, deps(repo, store));
    expect(store.plans.map((p) => p.baseRef)).toEqual(["main", "release"]);
  });

  it("does nothing without ci units", async () => {
    const store = new FakeStore();
    const outcome = await runPlanJob(
      job,
      deps(new FakeRepo("context: Hi\n", pull), store),
    );
    expect(outcome).toMatchObject({ reason: "ci disabled" });
    expect(store.plans).toEqual([]);
  });

  it("plans every unit without asking when the allowance is spent", async () => {
    const store = new FakeStore();
    store.spent = 10_000;
    const requests: Request[] = [];
    await runPlanJob(
      job,
      deps(new FakeRepo(CONFIG, pull), store, { ask: jev(requests) }),
    );
    expect(requests).toEqual([]);
    expect(store.plans[0]?.model).toBeNull();
    expect(store.plans[0]?.decisions.map((d) => [d.run, d.rule])).toEqual([
      [true, "monthly budget spent"],
      [true, "monthly budget spent"],
    ]);
  });

  it("plans every unit when the change is too large or Jev fails", async () => {
    const large = new FakeRepo(CONFIG, pull);
    large.pull = async () => ({
      title: "Huge",
      body: null,
      state: "open",
      head: { sha: "abc123" },
      base: { ref: "main", sha: "base123" },
      changed_files: 4000,
    });
    const store = new FakeStore();
    await runPlanJob(job, deps(large, store));
    expect(store.plans[0]?.decisions[0]?.rule).toBe("too large to judge");

    const failing = new FakeStore();
    await runPlanJob(
      job,
      deps(new FakeRepo(CONFIG, pull), failing, {
        ask: async () => {
          throw new Error("Jev returned 500");
        },
      }),
    );
    expect(failing.plans[0]?.decisions.every((d) => d.run)).toBe(true);
    expect(failing.plans[0]?.decisions[0]?.rule).toBe("selection failed");
  });

  it("plans every unit when Jev leaves a unit unanswered", async () => {
    const store = new FakeStore();
    await runPlanJob(
      job,
      deps(new FakeRepo(CONFIG, pull), store, {
        ask: async () => ({
          model: "jev-1.13.0",
          usage: { input_tokens: 1000 },
          answers: { "unit:linux-x64": { type: "noul", noul: 0.9 } },
        }),
      }),
    );
    expect(store.plans[0]).toMatchObject({
      model: "jev-1.13.0",
      inputTokens: 1000,
    });
    expect(store.plans[0]?.decisions.map((d) => [d.run, d.rule])).toEqual([
      [true, "selection failed"],
      [true, "selection failed"],
    ]);
  });

  it("stops asking once a chunk spends the allowance, keeping what it spent", async () => {
    const repo = new FakeRepo(CONFIG, pull);
    repo.files = Array.from({ length: 6 }, (_, i) => ({
      filename: `src/${i}.cpp`,
      status: "modified",
      additions: 7000,
      deletions: 0,
      patch: "+x\n".repeat(7000),
    }));
    const store = new FakeStore();
    const requests: Request[] = [];
    await runPlanJob(
      job,
      deps(repo, store, {
        ask: jev(requests),
        budget: { installation: 1000, global: 100_000 },
      }),
    );
    expect(requests).toHaveLength(1);
    expect(store.plans[0]).toMatchObject({ inputTokens: 1000 });
    expect(store.plans[0]?.decisions[0]?.rule).toBe("monthly budget spent");
  });
});
