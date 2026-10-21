-- The workflow file a run ran, as the config's ci.workflow names it, so a
-- unit's passes count only for the workflow that earned them. Rows from
-- before this, with no workflow, never match a configured one, and neither do
-- passes from a workflow the config no longer names.
ALTER TABLE ci_runs ADD COLUMN workflow TEXT NOT NULL DEFAULT '';
ALTER TABLE unit_passes ADD COLUMN workflow TEXT NOT NULL DEFAULT '';
