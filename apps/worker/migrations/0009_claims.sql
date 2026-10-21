-- A job claims an item before spending on it, so duplicate deliveries handled
-- at once ask Jev only once. A claim expires after a short lease, in case its
-- job died without releasing it.
CREATE TABLE claims (
  kind TEXT NOT NULL CHECK (kind IN ('label', 'plan')),
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
