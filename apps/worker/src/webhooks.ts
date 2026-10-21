import * as v from "valibot";

import { allowlisted, type Allowlist } from "./allowlist.ts";
import type { LabelJob } from "./jobs/label.ts";
import type { PlanJob } from "./jobs/plan.ts";

const Repository = v.object({
  id: v.number(),
  full_name: v.string(),
  private: v.boolean(),
});

const Item = v.object({ number: v.number() });

const ItemFields = {
  action: v.string(),
  installation: v.object({ id: v.number() }),
  repository: Repository,
};

const IssuesEvent = v.object({ ...ItemFields, issue: Item });
const PullRequestEvent = v.object({
  ...ItemFields,
  pull_request: v.object({
    ...Item.entries,
    head: v.object({ sha: v.string() }),
    base: v.object({ ref: v.string() }),
  }),
  changes: v.optional(v.object({ base: v.optional(v.unknown()) })),
});

/** Pull request actions that leave it at a head no plan has judged. */
const NEW_HEAD = new Set(["opened", "reopened", "synchronize"]);

const WorkflowRunEvent = v.object({
  ...ItemFields,
  workflow_run: v.object({
    id: v.number(),
    run_attempt: v.number(),
    conclusion: v.nullable(v.string()),
    head_sha: v.string(),
  }),
});

const InstallationEvent = v.object({
  action: v.string(),
  installation: v.object({
    id: v.number(),
    account: v.object({ login: v.string() }),
  }),
});

const InstallationRepositoriesEvent = v.object({
  action: v.string(),
  installation: v.object({ id: v.number() }),
  repositories_removed: v.optional(v.array(v.object({ id: v.number() })), []),
});

export type Effects = {
  jobs: (LabelJob | PlanJob)[];
  installations: { id: number; account: string; deleted: boolean }[];
  /** Runs to delete: the whole installation's, or only some repositories'. */
  forget: { installationId: number; repoIds?: number[] }[];
  /** Workflow runs that succeeded, whose units passed if a plan step asked. */
  succeeded: SucceededRun[];
};

export type SucceededRun = {
  repoId: number;
  runId: number;
  attempt: number;
  head: string;
};

/** Public repositories are open to all; private ones need the allowlist. */
export type Policy = { privateAllowlist: Allowlist };

export function allowed(
  repository: v.InferOutput<typeof Repository>,
  policy: Policy,
): boolean {
  return (
    !repository.private ||
    allowlisted(policy.privateAllowlist, repository.full_name)
  );
}

export function webhookEffects(
  event: string,
  payload: unknown,
  policy: Policy,
): Effects {
  const effects: Effects = {
    jobs: [],
    installations: [],
    forget: [],
    succeeded: [],
  };

  if (event === "installation") {
    const parsed = v.safeParse(InstallationEvent, payload);
    if (parsed.success) {
      const { action, installation } = parsed.output;
      effects.installations.push({
        id: installation.id,
        account: installation.account.login,
        deleted: action === "deleted" || action === "suspend",
      });
      if (action === "deleted") {
        effects.forget.push({ installationId: installation.id });
      }
    }
    return effects;
  }

  if (event === "installation_repositories") {
    const parsed = v.safeParse(InstallationRepositoriesEvent, payload);
    if (parsed.success && parsed.output.action === "removed") {
      effects.forget.push({
        installationId: parsed.output.installation.id,
        repoIds: parsed.output.repositories_removed.map((r) => r.id),
      });
    }
    return effects;
  }

  // A failed or cancelled run moves no unit's last pass, so the next plan
  // judges those units again from wherever they last passed.
  if (event === "workflow_run") {
    const parsed = v.safeParse(WorkflowRunEvent, payload);
    if (
      parsed.success &&
      parsed.output.action === "completed" &&
      parsed.output.workflow_run.conclusion === "success" &&
      allowed(parsed.output.repository, policy)
    ) {
      const run = parsed.output.workflow_run;
      effects.succeeded.push({
        repoId: parsed.output.repository.id,
        runId: run.id,
        attempt: run.run_attempt,
        head: run.head_sha,
      });
    }
    return effects;
  }

  if (event !== "issues" && event !== "pull_request") return effects;
  const parsed =
    event === "issues"
      ? v.safeParse(IssuesEvent, payload)
      : v.safeParse(PullRequestEvent, payload);
  if (!parsed.success) return effects;
  const { action, installation, repository } = parsed.output;
  if (!allowed(repository, policy)) return effects;
  const item =
    "issue" in parsed.output ? parsed.output.issue : parsed.output.pull_request;

  if (action === "opened") {
    effects.jobs.push({
      type: "label",
      installationId: installation.id,
      repoId: repository.id,
      repo: repository.full_name,
      number: item.number,
    });
  }
  // Retargeting a pull request, as a stack does when its parent merges,
  // changes what it would merge without changing its head.
  if (
    "pull_request" in parsed.output &&
    (NEW_HEAD.has(action) ||
      (action === "edited" && parsed.output.changes?.base !== undefined))
  ) {
    effects.jobs.push({
      type: "plan",
      installationId: installation.id,
      repoId: repository.id,
      repo: repository.full_name,
      number: item.number,
      head: parsed.output.pull_request.head.sha,
      base: parsed.output.pull_request.base.ref,
    });
  }
  return effects;
}
