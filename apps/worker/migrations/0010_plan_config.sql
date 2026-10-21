-- A plan holds only for the CI config it was judged under: new units, paths,
-- or thresholds on the default branch need a new plan for the same head.
-- SQLite can't change a unique key in place, so the table is rebuilt; plans
-- from before this have no config identity and are dropped.
DROP TABLE ci_plans;
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
  -- A hash of the CI config the plan was judged under.
  config TEXT NOT NULL,
  -- Null when a rule planned every unit without asking Jev.
  model TEXT,
  decisions TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (repo_id, number, head_sha, base_ref, config)
);
CREATE INDEX ci_plans_repo ON ci_plans (repo, created_at);

-- Workflows asking for a pending plan claim the request too, so one plan is
-- queued per lease however often they ask.
DROP TABLE claims;
CREATE TABLE claims (
  kind TEXT NOT NULL CHECK (kind IN ('label', 'plan', 'request')),
  repo_id INTEGER NOT NULL,
  number INTEGER NOT NULL,
  -- What else identifies the work, such as a plan's head and base.
  key TEXT NOT NULL DEFAULT '',
  -- The execution holding the claim, so one whose lease lapsed can't release
  -- the claim another execution has since taken.
  owner TEXT NOT NULL,
  claimed_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (kind, repo_id, number, key)
);
