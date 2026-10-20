CREATE TABLE installations (
  id INTEGER PRIMARY KEY,
  account TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Jev input tokens spent per installation per UTC day, for the daily budget.
CREATE TABLE usage (
  installation_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (installation_id, day)
);

-- One answer per question per state, keyed by hashes of each, and by the model
-- version that answered. Backtests reuse these instead of asking again.
CREATE TABLE answers (
  state_key TEXT NOT NULL,
  question_key TEXT NOT NULL,
  model TEXT NOT NULL,
  answer TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (state_key, question_key, model)
);

CREATE TABLE label_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_id INTEGER NOT NULL,
  repo TEXT NOT NULL,
  number INTEGER NOT NULL,
  state_key TEXT NOT NULL,
  model TEXT NOT NULL,
  decisions TEXT NOT NULL,
  added TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX label_runs_item ON label_runs (repo_id, number);

-- Every label change on an item, so corrections to Rubberstamp's labels become
-- backtest cases.
CREATE TABLE label_events (
  repo_id INTEGER NOT NULL,
  number INTEGER NOT NULL,
  label TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('labeled', 'unlabeled')),
  actor TEXT NOT NULL,
  actor_is_bot INTEGER NOT NULL,
  at TEXT NOT NULL
);
CREATE INDEX label_events_item ON label_events (repo_id, number);
