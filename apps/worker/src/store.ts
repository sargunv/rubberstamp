import type { Json, LabelDecision } from "@docket/core";

export type LabelRun = {
  repoId: number;
  repo: string;
  number: number;
  stateKey: string;
  model: string;
  decisions: LabelDecision[];
  added: string[];
  inputTokens: number;
};

export type CachedAnswer = {
  stateKey: string;
  questionKey: string;
  model: string;
  answer: Json;
};

export type LabelEvent = {
  repoId: number;
  number: number;
  label: string;
  action: "labeled" | "unlabeled";
  actor: string;
  actorIsBot: boolean;
  at: string;
};

export interface Store {
  hasLabelRun(repoId: number, number: number): Promise<boolean>;
  usage(installationId: number, day: string): Promise<number>;
  addUsage(installationId: number, day: string, tokens: number): Promise<void>;
  saveState(key: string, state: Json): Promise<void>;
  saveLabelRun(run: LabelRun, answers: CachedAnswer[]): Promise<void>;
  recordLabelEvent(event: LabelEvent): Promise<void>;
  saveInstallation(
    id: number,
    account: string,
    deleted: boolean,
  ): Promise<void>;
}

export class CloudflareStore implements Store {
  constructor(
    private readonly db: D1Database,
    private readonly states: R2Bucket,
  ) {}

  async hasLabelRun(repoId: number, number: number): Promise<boolean> {
    const row = await this.db
      .prepare(
        "SELECT 1 FROM label_runs WHERE repo_id = ? AND number = ? LIMIT 1",
      )
      .bind(repoId, number)
      .first();
    return row !== null;
  }

  async usage(installationId: number, day: string): Promise<number> {
    const tokens = await this.db
      .prepare(
        "SELECT input_tokens FROM usage WHERE installation_id = ? AND day = ?",
      )
      .bind(installationId, day)
      .first<number>("input_tokens");
    return tokens ?? 0;
  }

  async addUsage(installationId: number, day: string, tokens: number) {
    await this.db
      .prepare(
        `INSERT INTO usage (installation_id, day, input_tokens) VALUES (?, ?, ?)
         ON CONFLICT (installation_id, day)
         DO UPDATE SET input_tokens = input_tokens + excluded.input_tokens`,
      )
      .bind(installationId, day, tokens)
      .run();
  }

  async saveState(key: string, state: Json) {
    await this.states.put(`states/${key}.json`, JSON.stringify(state), {
      httpMetadata: { contentType: "application/json" },
    });
  }

  async saveLabelRun(run: LabelRun, answers: CachedAnswer[]) {
    const insertAnswer = this.db.prepare(
      `INSERT OR REPLACE INTO answers (state_key, question_key, model, answer)
       VALUES (?, ?, ?, ?)`,
    );
    await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO label_runs
             (repo_id, repo, number, state_key, model, decisions, added, input_tokens)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          run.repoId,
          run.repo,
          run.number,
          run.stateKey,
          run.model,
          JSON.stringify(run.decisions),
          JSON.stringify(run.added),
          run.inputTokens,
        ),
      ...answers.map((row) =>
        insertAnswer.bind(
          row.stateKey,
          row.questionKey,
          row.model,
          JSON.stringify(row.answer),
        ),
      ),
    ]);
  }

  async recordLabelEvent(event: LabelEvent) {
    await this.db
      .prepare(
        `INSERT INTO label_events
           (repo_id, number, label, action, actor, actor_is_bot, at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        event.repoId,
        event.number,
        event.label,
        event.action,
        event.actor,
        event.actorIsBot ? 1 : 0,
        event.at,
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
}
