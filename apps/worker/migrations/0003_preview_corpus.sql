-- Tuning previews a fresh sample of recent items instead of matching history,
-- so live runs keep no states, answers, or label changes for it.
DROP TABLE label_events;
DROP TABLE answers;

-- A live run keeps only its decisions, and only for a while.
ALTER TABLE label_runs DROP COLUMN state_key;
CREATE INDEX label_runs_created ON label_runs (created_at);

-- Uninstalling deletes an installation's runs.
ALTER TABLE label_runs ADD COLUMN installation_id INTEGER;
UPDATE label_runs SET installation_id = (
  SELECT id FROM installations
  WHERE lower(account) = lower(substr(label_runs.repo, 1, instr(label_runs.repo, '/') - 1))
);
CREATE INDEX label_runs_installation ON label_runs (installation_id);
