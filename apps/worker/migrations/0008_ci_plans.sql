-- The CI plan for each head and base branch of a pull request: whether each
-- unit runs, and the score or rule behind it. Retargeting a pull request
-- changes what it would merge without changing its head. Like label runs,
-- plans keep decisions, never states or answers. The base commit is kept so a
-- later plan can judge only what changed since a unit last passed.
CREATE TABLE ci_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  installation_id INTEGER NOT NULL,
  repo_id INTEGER NOT NULL,
  repo TEXT NOT NULL,
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  head_sha TEXT NOT NULL,
  base_ref TEXT NOT NULL,
  base_sha TEXT NOT NULL,
  -- Null when a rule planned every unit without asking Jev.
  model TEXT,
  decisions TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (repo_id, number, head_sha, base_ref)
);
CREATE INDEX ci_plans_repo ON ci_plans (repo, created_at);

-- Labeling and CI selection share the allowance, and usage records which spent
-- it. Usage recorded before this was all labeling.
CREATE TABLE usage_by_kind (
  installation_id INTEGER NOT NULL,
  period TEXT NOT NULL,
  repo TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'labels' CHECK (kind IN ('labels', 'ci')),
  input_tokens INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (installation_id, period, repo, kind)
);

INSERT INTO usage_by_kind (installation_id, period, repo, input_tokens)
SELECT installation_id, period, repo, input_tokens FROM usage;

DROP TABLE usage;

ALTER TABLE usage_by_kind RENAME TO usage;

CREATE INDEX usage_period ON usage (period);
