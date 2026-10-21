import * as v from "valibot";

import { allowlisted, type Allowlist } from "./allowlist.ts";
import type { LabelJob } from "./jobs/label.ts";

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
const PullRequestEvent = v.object({ ...ItemFields, pull_request: Item });

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
  jobs: LabelJob[];
  installations: { id: number; account: string; deleted: boolean }[];
  /** Runs to delete: the whole installation's, or only some repositories'. */
  forget: { installationId: number; repoIds?: number[] }[];
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
  const effects: Effects = { jobs: [], installations: [], forget: [] };

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
  return effects;
}
