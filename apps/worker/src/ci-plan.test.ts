import type { UnitDecision } from "@sargunv/rubberstamp-core";
import * as v from "valibot";
import { describe, expect, it } from "vite-plus/test";

import { parseAllowlist } from "./allowlist.ts";
import {
  ciPlan,
  PlanQuery,
  RETRY_AFTER_SECONDS,
  type PlanQueryDeps,
} from "./ci-plan.ts";
import { GitHubError, type Issue } from "./github/client.ts";
import type { PlanJob } from "./jobs/plan.ts";
import { CONFIG as LABELS_ONLY, FakeRepo, FakeStore } from "./testing.ts";

const CONFIG = `
ci:
  units:
    linux: { covers: Linux. }
    macos: { covers: macOS. }
`;

const HEAD = "a".repeat(40);
const OLD = "b".repeat(40);
const URL = "https://rubberstamp.example/o/r";

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
  };
  const save = (head: string, decisions: UnitDecision[]) =>
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
    });
  return { repo, store, jobs, deps, save };
}

describe("ciPlan", () => {
  it("answers with the saved plan's running units", async () => {
    const { deps, save } = setup();
    save(HEAD, judged);

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
    save(HEAD, [
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
    save(OLD, judged);

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
    save(HEAD, judged);

    expect((await ciPlan(query(), null, deps)).code).toBe(401);
    expect((await ciPlan(query(), "bad", deps)).code).toBe(401);
    expect((await ciPlan(query(), "good", deps)).code).toBe(200);
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

  it.each([
    { repository: "../r", pull_request: 1, sha: HEAD },
    { repository: "o/..", pull_request: 1, sha: HEAD },
    { repository: "o/r/x", pull_request: 1, sha: HEAD },
    { repository: "o/r", pull_request: 1.5, sha: HEAD },
    { repository: "o/r", pull_request: 1, sha: "abc123" },
  ])("rejects %j", (body) => {
    expect(v.safeParse(PlanQuery, body).success).toBe(false);
  });
});
