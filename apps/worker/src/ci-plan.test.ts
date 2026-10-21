import {
  ciConfigHash,
  parseConfig,
  type UnitDecision,
} from "@sargunv/rubberstamp-core";
import * as v from "valibot";
import { describe, expect, it } from "vite-plus/test";

import { parseAllowlist } from "./allowlist.ts";
import {
  ciPlan,
  PlanQuery,
  RETRY_AFTER_SECONDS,
  type PlanQueryDeps,
} from "./ci-plan.ts";
import { GitHubError, type Issue, type WorkflowRun } from "./github/client.ts";
import type { PlanJob } from "./jobs/plan.ts";
import { CONFIG as LABELS_ONLY, FakeRepo, FakeStore } from "./testing.ts";

const CONFIG = `
ci:
  workflow: .github/workflows/ci.yml
  units:
    linux: { covers: Linux. }
    macos: { covers: macOS. }
`;

const HEAD = "a".repeat(40);
const OLD = "b".repeat(40);
const URL = "https://rubberstamp.example/o/r";
const NOW = new Date("2026-10-21T12:00:00Z");

const pull: Issue = {
  title: "Fix camera",
  body: null,
  state: "open",
  labels: [],
  pull_request: {},
};

const query = (overrides: Partial<PlanQuery> = {}): PlanQuery => ({
  repository: "o/r",
  pull_request: 3,
  sha: HEAD,
  start: false,
  ...overrides,
});

const judged: UnitDecision[] = [
  { unit: "linux", threshold: 0.5, run: true, score: 0.9, rule: "" },
  { unit: "macos", threshold: 0.5, run: false, score: 0.2, rule: "" },
];

function setup(
  options: { source?: string | null; tokens?: string[]; allow?: string } = {},
) {
  const repo = new FakeRepo(
    options.source === undefined ? CONFIG : options.source,
    pull,
  );
  repo.head = HEAD;
  const store = new FakeStore();
  const jobs: PlanJob[] = [];
  const deps: PlanQueryDeps = {
    installationFor: async (name) => (name === "o/r" ? { id: 1 } : null),
    repo: () => repo,
    canRead: async (token, id) =>
      id === repo.repoId && (options.tokens ?? []).includes(token),
    store,
    enqueue: async (job) => {
      jobs.push(job);
    },
    policy: { privateAllowlist: parseAllowlist(options.allow ?? "o/*") },
    origin: "https://rubberstamp.example",
    now: () => NOW,
  };
  // Saved under the config the repository has now, unless told otherwise.
  const save = async (
    head: string,
    decisions: UnitDecision[],
    source = CONFIG,
  ) => {
    const parsed = parseConfig(source);
    if (!parsed.ok) throw new Error(parsed.errors.join("\n"));
    store.plans.push({
      installationId: 1,
      repoId: repo.repoId,
      repo: "o/r",
      number: 3,
      title: pull.title,
      head,
      baseRef: "main",
      base: "base123",
      model: "jev-1.13.0",
      decisions,
      inputTokens: 1000,
      config: await ciConfigHash(parsed.config),
    });
  };
  return { repo, store, jobs, deps, save };
}

describe("ciPlan", () => {
  it("answers with the saved plan's running units", async () => {
    const { deps, save } = setup();
    await save(HEAD, judged);

    expect(await ciPlan(query(), null, deps)).toEqual({
      code: 200,
      body: {
        status: "ready",
        all: false,
        units: ["linux"],
        decisions: judged,
        url: URL,
      },
    });
  });

  it("runs everything when one rule decided every unit", async () => {
    const { deps, save } = setup();
    await save(HEAD, [
      { unit: "linux", threshold: 0.5, run: true, score: null, rule: "x" },
      { unit: "macos", threshold: 0.5, run: true, score: null, rule: "x" },
    ]);

    const reply = await ciPlan(query(), null, deps);
    expect(reply.body).toMatchObject({
      status: "ready",
      all: true,
      units: ["linux", "macos"],
    });
  });

  it("waits for a plan without queueing one unless asked to start", async () => {
    const { deps, jobs } = setup();

    expect(await ciPlan(query(), null, deps)).toEqual({
      code: 202,
      body: { status: "pending", retryAfter: RETRY_AFTER_SECONDS, url: URL },
    });
    expect(jobs).toEqual([]);
  });

  it("queues the plan a webhook would have when asked to start", async () => {
    const { deps, jobs } = setup();

    const reply = await ciPlan(query({ start: true }), null, deps);
    expect(reply.code).toBe(202);
    expect(jobs).toEqual([
      {
        type: "plan",
        installationId: 1,
        repoId: 2,
        repo: "o/r",
        number: 3,
        head: HEAD,
        base: "main",
      },
    ]);
  });

  it("queues one plan however often it's asked to start", async () => {
    const { deps, jobs } = setup();
    await ciPlan(query({ start: true }), null, deps);
    await ciPlan(query({ start: true }), null, deps);
    expect(jobs).toHaveLength(1);
  });

  it("doesn't follow a plan judged under an older config", async () => {
    const { deps, save } = setup();
    await save(HEAD, judged, `${CONFIG}    windows: { covers: Windows. }\n`);
    expect((await ciPlan(query(), null, deps)).code).toBe(202);
  });

  it("runs everything for a superseded push without planning it", async () => {
    const { deps, jobs } = setup();

    const reply = await ciPlan(query({ sha: OLD, start: true }), null, deps);
    expect(reply).toEqual({
      code: 200,
      body: {
        status: "ready",
        all: true,
        units: [],
        decisions: [],
        reason: "a newer push superseded this commit",
        url: URL,
      },
    });
    expect(jobs).toEqual([]);
  });

  it("still answers a superseded push that was planned", async () => {
    const { deps, save } = setup();
    await save(OLD, judged);

    const reply = await ciPlan(query({ sha: OLD }), null, deps);
    expect(reply.body).toMatchObject({ status: "ready", units: ["linux"] });
  });

  it.each([
    ["no config", null],
    ["invalid config", "ci: nope"],
    ["no ci units configured", LABELS_ONLY],
  ])("runs everything with %s", async (reason, source) => {
    const { deps, jobs } = setup({ source });

    const reply = await ciPlan(query({ start: true }), null, deps);
    expect(reply).toMatchObject({
      code: 200,
      body: { status: "ready", all: true, units: [], reason },
    });
    expect(jobs).toEqual([]);
  });

  it("needs a token that can read a private repository", async () => {
    const { deps, repo, save } = setup({ tokens: ["good"] });
    repo.private = true;
    await save(HEAD, judged);

    expect((await ciPlan(query(), null, deps)).code).toBe(401);
    expect((await ciPlan(query(), "bad", deps)).code).toBe(401);
    expect((await ciPlan(query(), "good", deps)).code).toBe(200);
  });

  it("doesn't tell a caller without access which private pull requests exist", async () => {
    const { deps, repo } = setup();
    repo.private = true;
    repo.pull = async () => {
      throw new GitHubError(404, "/repos/o/r/pulls/3", "Not Found");
    };
    expect((await ciPlan(query(), null, deps)).code).toBe(401);
  });

  it("runs everything for a closed pull request without planning it", async () => {
    const { deps, repo, jobs } = setup();
    const pull = repo.pull;
    repo.pull = async () => ({ ...(await pull()), state: "closed" });
    const reply = await ciPlan(query({ start: true }), null, deps);
    expect(reply).toMatchObject({ code: 200, body: { all: true } });
    expect(jobs).toEqual([]);
  });

  it("frees the request when queueing fails, so the next ask can start it", async () => {
    const { deps, jobs } = setup();
    let down = true;
    deps.enqueue = async (job) => {
      if (down) throw new Error("queue unavailable");
      jobs.push(job);
    };
    await expect(ciPlan(query({ start: true }), null, deps)).rejects.toThrow();
    down = false;
    await ciPlan(query({ start: true }), null, deps);
    expect(jobs).toHaveLength(1);
  });

  describe("records the units the asking run executes", () => {
    const run = { run_id: 9001, run_attempt: 2 };

    /** The run as GitHub reports it, started an hour ago at the head. */
    const ranOn = (repo: FakeRepo, overrides: Partial<WorkflowRun> = {}) => {
      repo.workflowRuns.set(9001, {
        id: 9001,
        event: "pull_request",
        head_sha: HEAD,
        path: ".github/workflows/ci.yml",
        created_at: "2026-10-21T11:00:00Z",
        repository: { id: repo.repoId },
        ...overrides,
      });
    };

    it("from the plan it follows", async () => {
      const { deps, repo, save, store } = setup();
      ranOn(repo);
      await save(HEAD, judged);

      await ciPlan(query(run), null, deps);
      expect([...store.ciRuns.values()]).toEqual([
        {
          installationId: 1,
          repoId: 2,
          runId: 9001,
          attempt: 2,
          number: 3,
          head: HEAD,
          base: "base123",
          units: ["linux"],
        },
      ]);
    });

    it("as every configured unit when every unit runs", async () => {
      const { deps, repo, save, store } = setup();
      ranOn(repo);
      await save(HEAD, [
        { unit: "linux", threshold: 0.5, run: true, score: null, rule: "x" },
        { unit: "macos", threshold: 0.5, run: true, score: null, rule: "x" },
      ]);

      await ciPlan(query(run), null, deps);
      expect(store.ciRuns.get("2 9001 2")?.units).toEqual(["linux", "macos"]);
    });

    it("against the pull request's base when there's no plan to follow", async () => {
      const { deps, repo, store } = setup();
      ranOn(repo, { head_sha: OLD });

      await ciPlan(query({ ...run, sha: OLD }), null, deps);
      expect(store.ciRuns.get("2 9001 2")).toMatchObject({
        head: OLD,
        base: "base123",
        units: ["linux", "macos"],
      });
    });

    it("keeping the first record when the run asks again", async () => {
      const { deps, repo, save, store } = setup();
      ranOn(repo);
      await save(HEAD, judged);
      await ciPlan(query(run), null, deps);
      store.plans = [];
      await save(
        HEAD,
        judged.map((d) => ({ ...d, run: !d.run })),
      );
      await ciPlan(query(run), null, deps);
      expect([...store.ciRuns.values()].map((r) => r.units)).toEqual([
        ["linux"],
      ]);
    });

    it("but not while the plan is pending", async () => {
      const { deps, repo, store } = setup();
      ranOn(repo);
      const reply = await ciPlan(query({ ...run, start: true }), null, deps);
      expect(reply.code).toBe(202);
      expect(store.ciRuns.size).toBe(0);
    });

    it("but not when no units are configured", async () => {
      const { deps, repo, store } = setup({ source: LABELS_ONLY });
      ranOn(repo);
      await ciPlan(query(run), null, deps);
      expect(store.ciRuns.size).toBe(0);
    });

    it("but not without the workflow that gates jobs on units", async () => {
      const source = CONFIG.replace(/^ {2}workflow: .*\n/m, "");
      const { deps, repo, save, store } = setup({ source });
      ranOn(repo);
      await save(HEAD, judged, source);
      expect((await ciPlan(query(run), null, deps)).code).toBe(200);
      expect(store.ciRuns.size).toBe(0);
    });

    it("but not for an action too old to name its run", async () => {
      const { deps, repo, save, store } = setup();
      ranOn(repo);
      await save(HEAD, judged);
      expect((await ciPlan(query(), null, deps)).code).toBe(200);
      expect(store.ciRuns.size).toBe(0);
    });

    it.each<[string, Partial<WorkflowRun>]>([
      ["at another head", { head_sha: OLD }],
      ["for another event", { event: "pull_request_target" }],
      ["in another repository", { repository: { id: 99 } }],
      ["of another workflow", { path: ".github/workflows/lint.yml" }],
      ["started over a day ago", { created_at: "2026-10-20T11:59:59Z" }],
    ])("but not for a run %s", async (_, overrides) => {
      const { deps, repo, save, store } = setup();
      ranOn(repo, overrides);
      await save(HEAD, judged);

      const reply = await ciPlan(query(run), null, deps);
      expect(reply.body).toMatchObject({ status: "ready", units: ["linux"] });
      expect(store.ciRuns.size).toBe(0);
    });

    it("but not for a run GitHub doesn't know, or can't say", async () => {
      const { deps, repo, save, store } = setup();
      await save(HEAD, judged);
      expect((await ciPlan(query(run), null, deps)).code).toBe(200);

      repo.workflowRun = async () => {
        throw new GitHubError(502, "/repos/o/r/actions/runs/9001", "Bad");
      };
      expect((await ciPlan(query(run), null, deps)).code).toBe(200);
      expect(store.ciRuns.size).toBe(0);
    });
  });

  it("doesn't serve a private repository off the allowlist", async () => {
    const { deps, repo } = setup({ tokens: ["good"], allow: "" });
    repo.private = true;

    expect((await ciPlan(query(), "good", deps)).code).toBe(404);
  });

  it("doesn't serve a repository without the app or a missing pull request", async () => {
    const { deps, repo } = setup();
    expect((await ciPlan(query({ repository: "o/x" }), null, deps)).code).toBe(
      404,
    );

    repo.pull = async () => {
      throw new GitHubError(404, "/repos/o/r/pulls/3", "Not Found");
    };
    expect((await ciPlan(query(), null, deps)).code).toBe(404);
  });
});

describe("PlanQuery", () => {
  it("accepts a workflow's request and lowercases its sha", () => {
    const parsed = v.parse(PlanQuery, {
      repository: "maplibre/maplibre-native.ffi",
      pull_request: 12,
      sha: "A".repeat(40),
    });
    expect(parsed).toEqual({
      repository: "maplibre/maplibre-native.ffi",
      pull_request: 12,
      sha: "a".repeat(40),
      start: false,
    });
  });

  it("accepts the run that asks", () => {
    const parsed = v.parse(PlanQuery, {
      repository: "o/r",
      pull_request: 12,
      sha: HEAD,
      run_id: 18_000_000_000,
      run_attempt: 1,
    });
    expect(parsed).toMatchObject({ run_id: 18_000_000_000, run_attempt: 1 });
  });

  it.each([
    { repository: "o/r", pull_request: 1, sha: HEAD, run_id: 0 },
    { repository: "o/r", pull_request: 1, sha: HEAD, run_attempt: "1" },
    { repository: "../r", pull_request: 1, sha: HEAD },
    { repository: "o/..", pull_request: 1, sha: HEAD },
    { repository: "o/r/x", pull_request: 1, sha: HEAD },
    { repository: "o/r", pull_request: 1.5, sha: HEAD },
    { repository: "o/r", pull_request: 1, sha: "abc123" },
  ])("rejects %j", (body) => {
    expect(v.safeParse(PlanQuery, body).success).toBe(false);
  });
});
