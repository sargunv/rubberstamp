import * as v from "valibot";

import { allowlisted, type Allowlist } from "./allowlist.ts";
import type { LabelJob } from "./jobs/label.ts";
import type { LabelEvent } from "./store.ts";

const Repository = v.object({
  id: v.number(),
  full_name: v.string(),
  private: v.boolean(),
});

const Sender = v.object({ login: v.string(), type: v.string() });

const Item = v.object({ number: v.number(), updated_at: v.string() });

const ItemFields = {
  action: v.string(),
  installation: v.object({ id: v.number() }),
  repository: Repository,
  sender: Sender,
  label: v.optional(v.object({ name: v.string() })),
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

export type Effects = {
  jobs: LabelJob[];
  labelEvents: LabelEvent[];
  installations: { id: number; account: string; deleted: boolean }[];
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
  const effects: Effects = { jobs: [], labelEvents: [], installations: [] };

  if (event === "installation") {
    const parsed = v.safeParse(InstallationEvent, payload);
    if (parsed.success) {
      const { action, installation } = parsed.output;
      effects.installations.push({
        id: installation.id,
        account: installation.account.login,
        deleted: action === "deleted" || action === "suspend",
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
  const { action, installation, repository, sender, label } = parsed.output;
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
  if ((action === "labeled" || action === "unlabeled") && label) {
    effects.labelEvents.push({
      repoId: repository.id,
      number: item.number,
      label: label.name,
      action,
      actor: sender.login,
      actorIsBot: sender.type === "Bot",
      at: item.updated_at,
    });
  }
  return effects;
}
