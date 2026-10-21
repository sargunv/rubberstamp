import type { PullFile, Request, Response } from "@sargunv/rubberstamp-core";

import type {
  Issue,
  ListedItem,
  RepoApi,
  WorkflowRun,
} from "./github/client.ts";
import type {
  CiPlan,
  CiRun,
  Claim,
  LabelRun,
  PlanKey,
  Store,
  UnitPass,
  UsageKind,
} from "./store.ts";

export const CONFIG = `
context: A C API for MapLibre Native.
labels:
  groups:
    kind: { min: 1, max: 1, labels: [bug, feature] }
    area: { labels: ["area:*"] }
`;

/** Jev that always calls the item a bug about maps, and records requests. */
export function jev(requests: Request[]) {
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

export class FakeRepo implements RepoApi {
  readonly fullName = "o/r";
  added: string[] = [];
  constructor(
    private readonly source: string | null,
    private readonly item: Issue,
    private readonly laterLabels: string[] = [],
    private readonly recent: ListedItem[] = [],
  ) {}
  private reads = 0;
  config = async () =>
    this.source === null
      ? null
      : { path: ".config/rubberstamp.yml", source: this.source };
  labels = async () => [
    { name: "bug", description: "Broken", color: "d73a4a" },
    { name: "feature", description: "New", color: "a2eeef" },
    { name: "area:map", description: "Maps", color: "bfd4f2" },
    { name: "area:docs", description: "Docs", color: "bfd4f2" },
  ];
  issue = async () => {
    this.reads++;
    const extra = this.reads > 1 ? this.laterLabels : [];
    return {
      ...this.item,
      labels: [...this.item.labels, ...extra.map((name) => ({ name }))],
    };
  };
  /** The pull request's head and files, which a test may change. */
  head = "abc123";
  base = "main";
  repoId = 2;
  private = false;
  files: PullFile[] = [
    {
      filename: "src/map.cpp",
      status: "modified",
      additions: 3,
      deletions: 1,
      patch: "@@ -1 +1 @@\n-a\n+b",
    },
  ];
  repository = async () => ({
    id: this.repoId,
    full_name: this.fullName,
    private: this.private,
  });
  pull = async () => ({
    title: this.item.title,
    body: this.item.body,
    state: this.item.state,
    head: { sha: this.head },
    base: {
      ref: this.base,
      sha: "base123",
      repo: {
        id: this.repoId,
        full_name: this.fullName,
        private: this.private,
      },
    },
    changed_files: this.files.length,
  });
  pullFiles = async () => this.files;
  recentItems = async (count: number) => this.recent.slice(0, count);
  addLabels = async (_: number, labels: string[]) => {
    this.added.push(...labels);
  };
  /** The repository's workflow runs, by id. */
  workflowRuns = new Map<number, WorkflowRun>();
  workflowRun = async (runId: number) => this.workflowRuns.get(runId) ?? null;
}

export class FakeStore implements Store {
  runs: LabelRun[] = [];
  spent = 0;
  hasLabelRun = async () => this.runs.length > 0;
  usage = async () => this.spent;
  globalSpent = 0;
  globalUsage = async () => this.globalSpent;
  usageKinds: UsageKind[] = [];
  addUsage = async (
    _: number,
    __: string,
    ___: string,
    kind: UsageKind,
    tokens: number,
  ) => {
    this.spent += tokens;
    this.usageKinds.push(kind);
  };
  saveLabelRun = async (run: LabelRun) => {
    this.runs.push(run);
  };
  saveInstallation = async () => {};
  /** Each held claim's owner, by claim. */
  claims = new Map<string, string>();
  claim = async (claim: Claim, owner: string) => {
    const key = JSON.stringify(claim);
    if (this.claims.has(key)) return false;
    this.claims.set(key, owner);
    return true;
  };
  release = async (claim: Claim, owner: string) => {
    const key = JSON.stringify(claim);
    if (this.claims.get(key) === owner) this.claims.delete(key);
  };
  plans: CiPlan[] = [];
  findPlan = async (key: PlanKey) =>
    this.plans.find(
      (plan) =>
        plan.repoId === key.repoId &&
        plan.number === key.number &&
        plan.head === key.head &&
        plan.baseRef === key.baseRef &&
        plan.config === key.config,
    ) ?? null;
  savePlan = async (plan: CiPlan) => {
    this.plans.push(plan);
  };
  /** Workflow runs by repository, run and attempt; the first save stands. */
  ciRuns = new Map<string, CiRun>();
  saveRun = async (run: CiRun) => {
    const key = `${run.repoId} ${run.runId} ${run.attempt}`;
    if (!this.ciRuns.has(key)) this.ciRuns.set(key, run);
  };
  findRun = async (repoId: number, runId: number, attempt: number) =>
    [...this.ciRuns.values()]
      .filter(
        (run) =>
          run.repoId === repoId &&
          run.runId === runId &&
          run.attempt <= attempt,
      )
      .sort((a, b) => b.attempt - a.attempt)[0] ?? null;
  /** Each pass in the order recorded, like unit_passes. */
  passes: (UnitPass & {
    repoId: number;
    number: number;
    unit: string;
    runId: number;
  })[] = [];
  /** When the next pass is recorded. */
  now = "2026-10-21T00:00:00Z";
  savePasses = async (run: CiRun) => {
    for (const unit of run.units) {
      const seen = this.passes.some(
        (p) =>
          p.repoId === run.repoId && p.runId === run.runId && p.unit === unit,
      );
      if (seen) continue;
      this.passes.push({
        repoId: run.repoId,
        number: run.number,
        unit,
        runId: run.runId,
        head: run.head,
        base: run.base,
        at: this.now,
      });
    }
  };
  lastPasses = async (repoId: number, number: number) => {
    const last = new Map<string, UnitPass>();
    for (const { unit, head, base, at, ...pass } of this.passes) {
      if (pass.repoId === repoId && pass.number === number) {
        last.set(unit, { head, base, at });
      }
    }
    return last;
  };
}
