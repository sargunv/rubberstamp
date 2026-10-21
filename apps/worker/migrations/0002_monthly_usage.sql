-- Budgets are monthly, so usage counts per installation per UTC month.
CREATE TABLE usage_monthly (
  installation_id INTEGER NOT NULL,
  period TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (installation_id, period)
);

INSERT INTO usage_monthly (installation_id, period, input_tokens)
SELECT installation_id, substr(day, 1, 7), SUM(input_tokens)
FROM usage
GROUP BY installation_id, substr(day, 1, 7);

DROP TABLE usage;

ALTER TABLE usage_monthly RENAME TO usage;

-- The global budget sums every installation's usage for a month.
CREATE INDEX usage_period ON usage (period);
