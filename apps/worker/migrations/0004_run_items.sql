-- The decision log shows each item's title and whether it's an issue or a pull
-- request. Runs from before this have neither.
ALTER TABLE label_runs ADD COLUMN title TEXT;
ALTER TABLE label_runs ADD COLUMN type TEXT CHECK (type IN ('issue', 'pull request'));
CREATE INDEX label_runs_repo ON label_runs (repo, created_at);
