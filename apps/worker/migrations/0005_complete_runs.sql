-- Runs from before titles were recorded can't be shown in the log, so drop them
-- and require every run's installation, title, and type from here on.
CREATE TABLE label_runs_complete (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  installation_id INTEGER NOT NULL,
  repo_id INTEGER NOT NULL,
  repo TEXT NOT NULL,
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('issue', 'pull request')),
  model TEXT NOT NULL,
  decisions TEXT NOT NULL,
  added TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO label_runs_complete
  (id, installation_id, repo_id, repo, number, title, type, model, decisions,
   added, input_tokens, created_at)
SELECT id, installation_id, repo_id, repo, number, title, type, model,
  decisions, added, input_tokens, created_at
FROM label_runs
WHERE installation_id IS NOT NULL AND title IS NOT NULL AND type IS NOT NULL;

DROP TABLE label_runs;

ALTER TABLE label_runs_complete RENAME TO label_runs;

CREATE INDEX label_runs_item ON label_runs (repo_id, number);
CREATE INDEX label_runs_repo ON label_runs (repo, created_at);
CREATE INDEX label_runs_created ON label_runs (created_at);
CREATE INDEX label_runs_installation ON label_runs (installation_id);
