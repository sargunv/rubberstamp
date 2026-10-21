import {
  ciConfigHash,
  parseConfig,
  type PullFile,
  type Request,
  type Response,
} from "@sargunv/rubberstamp-core";
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

  it("doesn't save a plan for a head a push replaced while Jev judged", async () => {
    const repo = new FakeRepo(CONFIG, pull);
    const store = new FakeStore();
    const outcome = await runPlanJob(
      job,
      deps(repo, store, {
        ask: async (request) => {
          repo.head = "def456";
          return jev([])(request);
        },
      }),
    );
    expect(outcome).toMatchObject({ reason: "superseded" });
    expect(store.plans).toEqual([]);
    expect(store.usageKinds).toEqual(["ci"]);
  });

  it("plans again when the pull request is retargeted at the same head", async () => {
    const store = new FakeStore();
    const repo = new FakeRepo(CONFIG, pull);
    await runPlanJob(job, deps(repo, store));
    repo.base = "release";
    await runPlanJob({ ...job, base: "release" }, deps(repo, store));
    expect(store.plans.map((p) => p.baseRef)).toEqual(["main", "release"]);
  });

  it("leaves a head to the job that claimed it first", async () => {
    const store = new FakeStore();
    const parsed = parseConfig(CONFIG);
    if (!parsed.ok) throw new Error(parsed.errors.join("\n"));
    const config = await ciConfigHash(parsed.config);
    await store.claim(
      { kind: "plan", repoId: 2, number: 3, key: `abc123 main ${config}` },
      "another job",
    );
    const requests: Request[] = [];
    expect(
      await runPlanJob(
        job,
        deps(new FakeRepo(CONFIG, pull), store, { ask: jev(requests) }),
      ),
    ).toEqual({ status: "busy" });
    expect(requests).toEqual([]);
  });

  it("releases its claim when it fails, so the retry can plan", async () => {
    const store = new FakeStore();
    const repo = new FakeRepo(CONFIG, pull);
    const save = store.savePlan;
    store.savePlan = async () => {
      throw new Error("D1 is down");
    };
    await expect(runPlanJob(job, deps(repo, store))).rejects.toThrow();
    store.savePlan = save;
    expect(await runPlanJob(job, deps(repo, store))).toMatchObject({
      status: "planned",
    });
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
    const { pull: real } = large;
    large.pull = async () => ({
      ...(await real()),
      title: "Huge",
      body: null,
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

describe("runPlanJob since a unit last passed", () => {
  const SINCE = CONFIG.replace(
    "ci:\n",
    "ci:\n  workflow: .github/workflows/ci.yml\n",
  );
  const OLD = "0ld0ld0ld0ld";
  const OLD_BASE = "oldbase";

  const file = (filename: string, patch: string): PullFile => ({
    filename,
    status: "modified",
    additions: 1,
    deletions: 1,
    patch,
  });
  const APPLE = file("src/platform/apple/map.mm", "@@ -1 +1 @@\n-x\n+y");
  const MAP = file("src/map.cpp", "@@ -1 +1 @@\n-a\n+b");

  /** A pull request now changing `files`, whose units passed at `head`. */
  function setup(
    files: PullFile[],
    passed: { unit: string; head: string; base: string; workflow?: string }[],
  ) {
    const repo = new FakeRepo(SINCE, pull);
    repo.files = files;
    const store = new FakeStore();
    for (const pass of passed) {
      store.passes.push({
        workflow: ".github/workflows/ci.yml",
        ...pass,
        repoId: 2,
        number: 3,
        runId: 1,
        at: "2026-10-20T00:00:00Z",
      });
    }
    const requests: Request[] = [];
    return {
      repo,
      store,
      requests,
      run: () => runPlanJob(job, deps(repo, store, { ask: jev(requests) })),
    };
  }

  const both = (head: string, base: string) => [
    { unit: "linux-x64", head, base },
    { unit: "macos", head, base },
  ];

  it("judges from the merge base when no unit has passed", async () => {
    const { repo, requests, run } = setup([MAP], []);
    expect(await run()).toEqual({
      status: "planned",
      decisions: [
        { unit: "linux-x64", threshold: 0.5, run: true, score: 0.9, rule: "" },
        { unit: "macos", threshold: 0.5, run: false, score: 0.2, rule: "" },
      ],
    });
    expect(repo.compared).toEqual([]);
    expect(requests[0]?.state).not.toHaveProperty("change.scope");
  });

  it("ignores passes without the workflow that records them", async () => {
    const { repo, requests, run } = setup([MAP], both("abc123", "base123"));
    repo.config = async () => ({
      path: ".config/rubberstamp.yml",
      source: CONFIG,
    });
    expect(await run()).toMatchObject({
      decisions: [{ score: 0.9 }, { score: 0.2 }],
    });
    expect(requests).toHaveLength(1);
  });

  it("ignores passes another workflow, or none, recorded", async () => {
    const { requests, run } = setup(
      [MAP],
      [
        { unit: "linux-x64", head: "abc123", base: "base123", workflow: "" },
        {
          unit: "macos",
          head: "abc123",
          base: "base123",
          workflow: ".github/workflows/lint.yml",
        },
      ],
    );
    expect(await run()).toMatchObject({
      decisions: [{ score: 0.9 }, { score: 0.2 }],
    });
    expect(requests).toHaveLength(1);
  });

  it("doesn't run a unit that passed at this head and base", async () => {
    const { store, requests, run } = setup(
      [MAP],
      [{ unit: "linux-x64", head: "abc123", base: "base123" }],
    );
    expect(await run()).toEqual({
      status: "planned",
      decisions: [
        {
          unit: "linux-x64",
          threshold: 0.5,
          run: false,
          score: null,
          rule: "passed at this head",
        },
        { unit: "macos", threshold: 0.5, run: false, score: 0.2, rule: "" },
      ],
    });
    // Only the unit left is asked about, on the whole change.
    expect(Object.keys(requests[0]?.questions ?? {})).toEqual(["unit:macos"]);
    expect(store.plans[0]).toMatchObject({ inputTokens: 1000 });
  });

  it("asks nothing when every unit passed at this head", async () => {
    const { store, requests, run } = setup([MAP], both("abc123", "base123"));
    expect(await run()).toMatchObject({
      decisions: [
        { run: false, rule: "passed at this head" },
        { run: false, rule: "passed at this head" },
      ],
    });
    expect(requests).toEqual([]);
    expect(store.plans[0]).toMatchObject({ model: null, inputTokens: 0 });
  });

  it("finds no changes after a rebase that only moved the patch", async () => {
    const { repo, requests, run } = setup([MAP], both(OLD, OLD_BASE));
    repo.comparisons.set(`${OLD_BASE}...${OLD}`, [
      file("src/map.cpp", "@@ -40,3 +40,3 @@ int main() {\n ctx\n-a\n+b\n ctx"),
    ]);
    expect(await run()).toMatchObject({
      decisions: [
        {
          run: false,
          score: null,
          rule: "no changes since 0ld0ld0",
          since: OLD,
        },
        {
          run: false,
          score: null,
          rule: "no changes since 0ld0ld0",
          since: OLD,
        },
      ],
    });
    expect(repo.compared).toEqual([`${OLD_BASE}...${OLD}`]);
    expect(requests).toEqual([]);
  });

  it("judges only the files edited since the pass", async () => {
    const edited = file("src/map.cpp", "@@ -1 +1 @@\n-a\n+c");
    const { repo, requests, run } = setup([APPLE, edited], both(OLD, OLD_BASE));
    repo.comparisons.set(`${OLD_BASE}...${OLD}`, [APPLE, MAP]);
    expect(await run()).toEqual({
      status: "planned",
      decisions: [
        {
          unit: "linux-x64",
          threshold: 0.5,
          run: true,
          score: 0.9,
          rule: "",
          since: OLD,
        },
        // The Apple file didn't change since, so its path forces nothing.
        {
          unit: "macos",
          threshold: 0.5,
          run: false,
          score: 0.2,
          rule: "",
          since: OLD,
        },
      ],
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.state).toMatchObject({
      change: {
        scope: expect.stringContaining("commit 0ld0ld0"),
        files: ["M src/map.cpp (+1 -1)"],
      },
    });
    expect(JSON.stringify(requests[0]?.state)).not.toContain("apple");
  });

  it("judges each pass's units on their own changes", async () => {
    const { repo, requests, run } = setup(
      [MAP],
      [{ unit: "linux-x64", head: OLD, base: OLD_BASE }],
    );
    repo.comparisons.set(`${OLD_BASE}...${OLD}`, []);
    const outcome = await run();
    expect(outcome).toMatchObject({
      decisions: [{ score: 0.9, since: OLD }, { score: 0.2 }],
    });
    expect(
      outcome.status === "planned" && outcome.decisions[1],
    ).not.toHaveProperty("since");
    expect(requests.map((r) => Object.keys(r.questions))).toEqual([
      ["unit:macos"],
      ["unit:linux-x64"],
    ]);
  });

  it.each<[string, (repo: FakeRepo) => void]>([
    [
      "lists too many files to trust",
      (repo) => {
        repo.comparisons.set(
          `${OLD_BASE}...${OLD}`,
          Array.from({ length: 300 }, (_, i) => file(`src/${i}.cpp`, "+x")),
        );
      },
    ],
    [
      "has a file without a patch",
      (repo) => {
        repo.comparisons.set(`${OLD_BASE}...${OLD}`, [
          MAP,
          { ...file("logo.png", ""), patch: undefined },
        ]);
      },
    ],
    ["can't find the old head", () => {}],
    [
      "fails",
      (repo) => {
        repo.compare = async () => {
          throw new Error("GitHub 500");
        };
      },
    ],
  ])("judges from the merge base when the compare %s", async (_, breakIt) => {
    const { repo, requests, run } = setup([MAP], both(OLD, OLD_BASE));
    breakIt(repo);
    expect(await run()).toEqual({
      status: "planned",
      decisions: [
        { unit: "linux-x64", threshold: 0.5, run: true, score: 0.9, rule: "" },
        { unit: "macos", threshold: 0.5, run: false, score: 0.2, rule: "" },
      ],
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.state).not.toHaveProperty("change.scope");
  });

  it("judges from the merge base when the pull request lists too few files", async () => {
    const { repo, run } = setup([MAP], both(OLD, OLD_BASE));
    repo.comparisons.set(`${OLD_BASE}...${OLD}`, [MAP]);
    const { pull: real } = repo;
    repo.pull = async () => ({ ...(await real()), changed_files: 4000 });
    expect(await run()).toMatchObject({
      decisions: [
        { run: true, rule: "too large to judge" },
        { run: true, rule: "too large to judge" },
      ],
    });
    expect(repo.compared).toEqual([]);
  });

  it("shows a file the pull request no longer changes as reverted", async () => {
    const { repo, requests, run } = setup([MAP], both(OLD, OLD_BASE));
    repo.comparisons.set(`${OLD_BASE}...${OLD}`, [MAP, APPLE]);
    expect(await run()).toMatchObject({
      decisions: [
        { score: 0.9, since: OLD },
        { run: true, rule: "matches src/platform/apple/*", since: OLD },
      ],
    });
    expect(requests[0]?.state).toMatchObject({
      change: {
        files: [
          "src/platform/apple/map.mm (reverted: the pull request no longer changes it)",
        ],
      },
    });
  });
});
