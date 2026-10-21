-- The units a workflow run was told to execute, saved when its plan step asks.
-- GitHub's workflow_run event says only whether the whole run succeeded, so
-- this is what ties that outcome to units. A run finishes within hours, so
-- these rows are pruned after days, not with plans. Each attempt of a run asks
-- again, and only the attempt that succeeds counts.
CREATE TABLE ci_runs (
  installation_id INTEGER NOT NULL,
  repo_id INTEGER NOT NULL,
  run_id INTEGER NOT NULL,
  run_attempt INTEGER NOT NULL,
  number INTEGER NOT NULL,
  head_sha TEXT NOT NULL,
  -- The plan's base commit, or the base branch's head when there was no plan.
  base_sha TEXT NOT NULL,
  -- A JSON array of the unit ids the run executes.
  units TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (repo_id, run_id, run_attempt)
);
CREATE INDEX ci_runs_created ON ci_runs (created_at);

-- Each unit a successful run executed passed at that head and base, so a later
-- plan can judge only what changed since then. A failed run records nothing,
-- leaving each unit's last pass where it was.
CREATE TABLE unit_passes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  installation_id INTEGER NOT NULL,
  repo_id INTEGER NOT NULL,
  number INTEGER NOT NULL,
  unit TEXT NOT NULL,
  head_sha TEXT NOT NULL,
  base_sha TEXT NOT NULL,
  run_id INTEGER NOT NULL,
  passed_at TEXT NOT NULL DEFAULT (datetime('now')),
  -- A redelivered webhook, or a second successful attempt, records nothing new.
  UNIQUE (repo_id, run_id, unit)
);
CREATE INDEX unit_passes_pull ON unit_passes (repo_id, number);
CREATE INDEX unit_passes_passed ON unit_passes (passed_at);
