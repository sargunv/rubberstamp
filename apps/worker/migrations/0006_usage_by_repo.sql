-- The account page shows each repository's share of the monthly allowance.
-- Usage recorded before this has no repository; its repo is ''.
CREATE TABLE usage_by_repo (
  installation_id INTEGER NOT NULL,
  period TEXT NOT NULL,
  repo TEXT NOT NULL DEFAULT '',
  input_tokens INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (installation_id, period, repo)
);

INSERT INTO usage_by_repo (installation_id, period, repo, input_tokens)
SELECT installation_id, period, '', input_tokens FROM usage;

DROP TABLE usage;

ALTER TABLE usage_by_repo RENAME TO usage;

CREATE INDEX usage_period ON usage (period);
