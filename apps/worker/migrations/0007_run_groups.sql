-- Each run keeps the label groups it was judged with, so the log shows the
-- thresholds, limits, and descriptions of the time even after the config
-- changes. Runs from before this have none, so they're dropped.
ALTER TABLE label_runs ADD COLUMN groups TEXT NOT NULL DEFAULT '[]';
DELETE FROM label_runs WHERE groups = '[]';
