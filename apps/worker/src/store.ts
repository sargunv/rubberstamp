import {
  LogEntry,
  PlanEntry,
  type ActivityEntry,
  type ActivityItem,
  type LabelDecision,
  type PreviewGroup,
  type UnitDecision,
} from "@sargunv/rubberstamp-core";
import * as v from "valibot";

/** SQLite's datetime('now') is UTC without a zone; make it ISO 8601. */
function sqliteTime(value: string): string {
  return `${value.replace(" ", "T")}Z`;
}

/** A label_runs row, as the decision log shows it. */
const RunRow = v.pipe(
  v.object({
    number: v.number(),
    title: v.string(),
    type: v.picklist(["issue", "pull request"]),
    model: v.string(),
    decisions: v.string(),
    added: v.string(),
    groups: v.string(),
    input_tokens: v.number(),
    created_at: v.string(),
  }),
  v.transform((row) => ({
    number: row.number,
    title: row.title,
    type: row.type,
    model: row.model,
    decisions: JSON.parse(row.decisions),
    added: JSON.parse(row.added),
    groups: JSON.parse(row.groups),
    inputTokens: row.input_tokens,
    createdAt: sqliteTime(row.created_at),
  })),
  LogEntry,
);

/** A ci_plans row, as the CI tab shows it. */
const PlanRow = v.pipe(
  v.object({
    number: v.number(),
    title: v.string(),
    head_sha: v.string(),
    model: v.nullable(v.string()),
    decisions: v.string(),
    input_tokens: v.number(),
    created_at: v.string(),
  }),
  v.transform((row) => ({
    number: row.number,
    title: row.title,
    head: row.head_sha,
    model: row.model,
    decisions: JSON.parse(row.decisions),
    inputTokens: row.input_tokens,
    createdAt: sqliteTime(row.created_at),
  })),
  PlanEntry,
);

/** One of recentActivity's rows: an item, and its run and plan if it has them. */
function activityItem(row: Record<string, unknown>): ActivityItem {
  // The run's and plan's columns are prefixed, so each parses as its own row.
  const part = (prefix: string): Record<string, unknown> => ({
    number: row["number"],
    ...Object.fromEntries(
      Object.entries(row)
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, value]) => [key.slice(prefix.length), value]),
    ),
  });
  const run = part("run_");
  const plan = part("plan_");
  const labels = run["created_at"] == null ? undefined : v.parse(RunRow, run);
  const latest =
    plan["created_at"] == null ? undefined : v.parse(PlanRow, plan);
  // Titles change, so the item takes the one from Rubberstamp's latest action.
  const newest =
    latest && (!labels || latest.createdAt >= labels.createdAt)
      ? latest
      : labels;
  if (!newest) throw new Error("An activity row has neither a run nor a plan");
  return {
    number: newest.number,
    type: labels?.type ?? "pull request",
    title: newest.title,
    at: newest.createdAt,
    ...(labels ? { labels } : {}),
    ...(latest ? { plan: latest } : {}),
  };
}

/** Work a job reserves before spending on it. */
export type Claim = {
  kind: "label" | "plan";
  repoId: number;
  number: number;
  key: string;
};

/**
 * How long a claim holds. Jev answers in about a second, so even a long patch
 * with retries finishes well within it, and a job that died holding a claim
 * frees it soon. A job that outlives it risks only a duplicate request.
 */
export const CLAIM_MINUTES = 2;

/** What spent Jev usage, within the same allowance. */
export type UsageKind = "labels" | "ci";

export type CiPlan = {
  installationId: number;
  repoId: number;
  repo: string;
  number: number;
  title: string;
  head: string;
  baseRef: string;
  base: string;
  model: string | null;
  decisions: UnitDecision[];
  inputTokens: number;
};

export type LabelRun = {
  installationId: number;
  repoId: number;
  repo: string;
  number: number;
  title: string;
  type: "issue" | "pull request";
  model: string;
  groups: PreviewGroup[];
  decisions: LabelDecision[];
  added: string[];
  inputTokens: number;
};

export interface Store {
  hasLabelRun(repoId: number, number: number): Promise<boolean>;
  usage(installationId: number, period: string): Promise<number>;
  globalUsage(period: string): Promise<number>;
  addUsage(
    installationId: number,
    period: string,
    repo: string,
    kind: UsageKind,
    tokens: number,
  ): Promise<void>;
  saveLabelRun(run: LabelRun): Promise<void>;
  /** Whether this job now holds the claim; false if another job does. */
  claim(claim: Claim): Promise<boolean>;
  release(claim: Claim): Promise<void>;
  hasPlan(
    repoId: number,
    number: number,
    head: string,
    baseRef: string,
  ): Promise<boolean>;
  savePlan(plan: CiPlan): Promise<void>;
  saveInstallation(
    id: number,
    account: string,
    deleted: boolean,
  ): Promise<void>;
}

export class CloudflareStore implements Store {
  constructor(private readonly db: D1Database) {}

  async hasLabelRun(repoId: number, number: number): Promise<boolean> {
    const row = await this.db
      .prepare(
        "SELECT 1 FROM label_runs WHERE repo_id = ? AND number = ? LIMIT 1",
      )
      .bind(repoId, number)
      .first();
    return row !== null;
  }

  async usage(installationId: number, period: string): Promise<number> {
    const tokens = await this.db
      .prepare(
        "SELECT SUM(input_tokens) AS tokens FROM usage WHERE installation_id = ? AND period = ?",
      )
      .bind(installationId, period)
      .first<number | null>("tokens");
    return tokens ?? 0;
  }

  /** An installation's usage per repository for a month; '' is unattributed. */
  async repoUsage(
    installationId: number,
    period: string,
  ): Promise<{ repo: string; tokens: number }[]> {
    const { results } = await this.db
      .prepare(
        `SELECT repo, SUM(input_tokens) AS input_tokens FROM usage
         WHERE installation_id = ? AND period = ? GROUP BY repo`,
      )
      .bind(installationId, period)
      .all();
    return results.map((row) =>
      v.parse(
        v.pipe(
          v.object({ repo: v.string(), input_tokens: v.number() }),
          v.transform((r) => ({ repo: r.repo, tokens: r.input_tokens })),
        ),
        row,
      ),
    );
  }

  /** Items labeled per repository since a time, and when each last was. */
  async repoActivity(
    installationId: number,
    since: string,
  ): Promise<{ repo: string; labeled: number; lastLabeledAt: string }[]> {
    const { results } = await this.db
      .prepare(
        `SELECT repo, COUNT(*) AS labeled, MAX(created_at) AS last
         FROM label_runs WHERE installation_id = ? AND created_at >= ?
         GROUP BY repo`,
      )
      .bind(installationId, since)
      .all();
    return results.map((row) =>
      v.parse(
        v.pipe(
          v.object({ repo: v.string(), labeled: v.number(), last: v.string() }),
          v.transform((r) => ({
            repo: r.repo,
            labeled: r.labeled,
            lastLabeledAt: sqliteTime(r.last),
          })),
        ),
        row,
      ),
    );
  }

  /** An installation's newest label runs across its repositories. */
  async installationRuns(
    installationId: number,
    limit: number,
  ): Promise<ActivityEntry[]> {
    const { results } = await this.db
      .prepare(
        `SELECT repo, number, title, type, model, decisions, added, groups, input_tokens, created_at
         FROM label_runs WHERE installation_id = ? ORDER BY created_at DESC, id DESC LIMIT ?`,
      )
      .bind(installationId, limit)
      .all();
    return results.map((row) => ({
      ...v.parse(RunRow, row),
      repo: v.parse(v.object({ repo: v.string() }), row).repo,
    }));
  }

  async globalUsage(period: string): Promise<number> {
    const tokens = await this.db
      .prepare("SELECT SUM(input_tokens) AS tokens FROM usage WHERE period = ?")
      .bind(period)
      .first<number | null>("tokens");
    return tokens ?? 0;
  }

  async addUsage(
    installationId: number,
    period: string,
    repo: string,
    kind: UsageKind,
    tokens: number,
  ) {
    await this.db
      .prepare(
        `INSERT INTO usage (installation_id, period, repo, kind, input_tokens) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (installation_id, period, repo, kind)
         DO UPDATE SET input_tokens = input_tokens + excluded.input_tokens`,
      )
      .bind(installationId, period, repo, kind, tokens)
      .run();
  }

  async claim(claim: Claim) {
    const result = await this.db
      .prepare(
        `INSERT INTO claims (kind, repo_id, number, key) VALUES (?, ?, ?, ?)
         ON CONFLICT (kind, repo_id, number, key) DO UPDATE
         SET claimed_at = datetime('now')
         WHERE claimed_at < datetime('now', ?)`,
      )
      .bind(
        claim.kind,
        claim.repoId,
        claim.number,
        claim.key,
        `-${CLAIM_MINUTES} minutes`,
      )
      .run();
    return result.meta.changes > 0;
  }

  async release(claim: Claim) {
    await this.db
      .prepare(
        "DELETE FROM claims WHERE kind = ? AND repo_id = ? AND number = ? AND key = ?",
      )
      .bind(claim.kind, claim.repoId, claim.number, claim.key)
      .run();
  }

  async hasPlan(repoId: number, number: number, head: string, baseRef: string) {
    const row = await this.db
      .prepare(
        "SELECT 1 FROM ci_plans WHERE repo_id = ? AND number = ? AND head_sha = ? AND base_ref = ?",
      )
      .bind(repoId, number, head, baseRef)
      .first();
    return row !== null;
  }

  async savePlan(plan: CiPlan) {
    // A redelivered webhook can plan the same head and base twice; the first
    // plan stands.
    await this.db
      .prepare(
        `INSERT OR IGNORE INTO ci_plans
           (installation_id, repo_id, repo, number, title, head_sha, base_ref, base_sha, model, decisions, input_tokens)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        plan.installationId,
        plan.repoId,
        plan.repo,
        plan.number,
        plan.title,
        plan.head,
        plan.baseRef,
        plan.base,
        plan.model,
        JSON.stringify(plan.decisions),
        plan.inputTokens,
      )
      .run();
  }

  /**
   * The repository's most recently acted-on issues and pull requests, each
   * with its latest label run and latest plan, most recent first.
   */
  async recentActivity(repoId: number, limit: number): Promise<ActivityItem[]> {
    const { results } = await this.db
      .prepare(
        `WITH runs AS (
           SELECT * FROM label_runs l WHERE repo_id = ?1 AND id = (
             SELECT MAX(id) FROM label_runs
             WHERE repo_id = l.repo_id AND number = l.number
           )
         ),
         plans AS (
           SELECT * FROM ci_plans p WHERE repo_id = ?1 AND id = (
             SELECT MAX(id) FROM ci_plans
             WHERE repo_id = p.repo_id AND number = p.number
           )
         ),
         items AS (
           SELECT number, MAX(at) AS at FROM (
             SELECT number, created_at AS at FROM runs
             UNION ALL SELECT number, created_at FROM plans
           ) GROUP BY number ORDER BY at DESC LIMIT ?2
         )
         SELECT i.number,
           r.title AS run_title, r.type AS run_type, r.model AS run_model,
           r.decisions AS run_decisions, r.added AS run_added,
           r.groups AS run_groups, r.input_tokens AS run_input_tokens,
           r.created_at AS run_created_at,
           p.title AS plan_title, p.head_sha AS plan_head_sha,
           p.model AS plan_model, p.decisions AS plan_decisions,
           p.input_tokens AS plan_input_tokens, p.created_at AS plan_created_at
         FROM items i
         LEFT JOIN runs r ON r.number = i.number
         LEFT JOIN plans p ON p.number = i.number
         ORDER BY i.at DESC`,
      )
      .bind(repoId, limit)
      .all();
    return results.map(activityItem);
  }

  async saveLabelRun(run: LabelRun) {
    await this.db
      .prepare(
        `INSERT INTO label_runs
           (installation_id, repo_id, repo, number, title, type, model, decisions, added, groups, input_tokens)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        run.installationId,
        run.repoId,
        run.repo,
        run.number,
        run.title,
        run.type,
        run.model,
        JSON.stringify(run.decisions),
        JSON.stringify(run.added),
        JSON.stringify(run.groups),
        run.inputTokens,
      )
      .run();
  }

  async saveInstallation(id: number, account: string, deleted: boolean) {
    await this.db
      .prepare(
        `INSERT INTO installations (id, account, deleted) VALUES (?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           account = excluded.account,
           deleted = excluded.deleted,
           updated_at = datetime('now')`,
      )
      .bind(id, account, deleted ? 1 : 0)
      .run();
  }

  /** Forgets an installation's runs and plans, or only some repositories'. */
  async forgetRuns(installationId: number, repoIds?: number[]) {
    const tables = ["label_runs", "ci_plans"];
    if (repoIds === undefined) {
      await this.db.batch(
        tables.map((table) =>
          this.db
            .prepare(`DELETE FROM ${table} WHERE installation_id = ?`)
            .bind(installationId),
        ),
      );
      return;
    }
    const removals = tables.flatMap((table) => {
      const remove = this.db.prepare(
        `DELETE FROM ${table} WHERE installation_id = ? AND repo_id = ?`,
      );
      return repoIds.map((id) => remove.bind(installationId, id));
    });
    if (removals.length > 0) await this.db.batch(removals);
  }

  /** Deletes runs and plans older than the given number of days, and old claims. */
  async pruneRuns(days: number) {
    await this.db.batch([
      ...["label_runs", "ci_plans"].map((table) =>
        this.db
          .prepare(`DELETE FROM ${table} WHERE created_at < datetime('now', ?)`)
          .bind(`-${days} days`),
      ),
      // A claim matters only while its job runs, and the run or plan it saves
      // keeps the work from repeating after that.
      this.db.prepare(
        "DELETE FROM claims WHERE claimed_at < datetime('now', '-1 day')",
      ),
    ]);
  }
}
