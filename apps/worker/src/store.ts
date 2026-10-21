import type { LabelDecision } from "@sargunv/rubberstamp-core";

export type LabelRun = {
  installationId: number;
  repoId: number;
  repo: string;
  number: number;
  model: string;
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
    tokens: number,
  ): Promise<void>;
  saveLabelRun(run: LabelRun): Promise<void>;
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
        "SELECT input_tokens FROM usage WHERE installation_id = ? AND period = ?",
      )
      .bind(installationId, period)
      .first<number>("input_tokens");
    return tokens ?? 0;
  }

  async globalUsage(period: string): Promise<number> {
    const tokens = await this.db
      .prepare("SELECT SUM(input_tokens) AS tokens FROM usage WHERE period = ?")
      .bind(period)
      .first<number | null>("tokens");
    return tokens ?? 0;
  }

  async addUsage(installationId: number, period: string, tokens: number) {
    await this.db
      .prepare(
        `INSERT INTO usage (installation_id, period, input_tokens) VALUES (?, ?, ?)
         ON CONFLICT (installation_id, period)
         DO UPDATE SET input_tokens = input_tokens + excluded.input_tokens`,
      )
      .bind(installationId, period, tokens)
      .run();
  }

  async saveLabelRun(run: LabelRun) {
    await this.db
      .prepare(
        `INSERT INTO label_runs
           (installation_id, repo_id, repo, number, model, decisions, added, input_tokens)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        run.installationId,
        run.repoId,
        run.repo,
        run.number,
        run.model,
        JSON.stringify(run.decisions),
        JSON.stringify(run.added),
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

  /** Forgets an installation's runs, or only those of some repositories. */
  async forgetRuns(installationId: number, repoIds?: number[]) {
    if (repoIds === undefined) {
      await this.db
        .prepare("DELETE FROM label_runs WHERE installation_id = ?")
        .bind(installationId)
        .run();
      return;
    }
    const remove = this.db.prepare(
      "DELETE FROM label_runs WHERE installation_id = ? AND repo_id = ?",
    );
    if (repoIds.length > 0) {
      await this.db.batch(repoIds.map((id) => remove.bind(installationId, id)));
    }
  }

  /** Deletes runs older than the given number of days. */
  async pruneRuns(days: number) {
    await this.db
      .prepare("DELETE FROM label_runs WHERE created_at < datetime('now', ?)")
      .bind(`-${days} days`)
      .run();
  }
}
