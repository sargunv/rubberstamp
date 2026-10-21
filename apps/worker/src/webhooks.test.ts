import { describe, expect, it } from "vite-plus/test";

import { parseAllowlist } from "./allowlist.ts";
import { webhookEffects } from "./webhooks.ts";

const policy = { privateAllowlist: parseAllowlist("sargunv/*") };

function payload(
  overrides: { private?: boolean; owner?: string; action?: string } = {},
) {
  return {
    action: overrides.action ?? "opened",
    installation: { id: 7 },
    repository: {
      id: 42,
      full_name: `${overrides.owner ?? "maplibre"}/maplibre-native-ffi`,
      private: overrides.private ?? false,
    },
    pull_request: { number: 12, head: { sha: "abc123" } },
    issue: { number: 13 },
  };
}

describe("webhookEffects", () => {
  it("labels newly opened issues and pull requests, and plans the pull request's CI", () => {
    expect(webhookEffects("pull_request", payload(), policy).jobs).toEqual([
      {
        type: "label",
        installationId: 7,
        repoId: 42,
        repo: "maplibre/maplibre-native-ffi",
        number: 12,
      },
      {
        type: "plan",
        installationId: 7,
        repoId: 42,
        repo: "maplibre/maplibre-native-ffi",
        number: 12,
        head: "abc123",
      },
    ]);
    expect(webhookEffects("issues", payload(), policy).jobs[0]?.number).toBe(
      13,
    );
  });

  it("plans CI again for each push, but labels only once", () => {
    const jobs = (action: string) =>
      webhookEffects("pull_request", payload({ action }), policy).jobs.map(
        (job) => job.type,
      );
    expect(jobs("synchronize")).toEqual(["plan"]);
    expect(jobs("reopened")).toEqual(["plan"]);
    expect(jobs("edited")).toEqual([]);
  });

  it("serves private repositories only on the allowlist", () => {
    expect(
      webhookEffects("issues", payload({ private: true }), policy).jobs,
    ).toEqual([]);
    expect(
      webhookEffects(
        "issues",
        payload({ private: true, owner: "SargunV" }),
        policy,
      ).jobs,
    ).toHaveLength(1);
  });

  it("tracks installations, forgets them when uninstalled, and ignores other events", () => {
    const installation = (action: string) =>
      webhookEffects(
        "installation",
        { action, installation: { id: 7, account: { login: "maplibre" } } },
        policy,
      );
    expect(installation("deleted")).toEqual({
      jobs: [],
      installations: [{ id: 7, account: "maplibre", deleted: true }],
      forget: [{ installationId: 7 }],
    });
    expect(installation("suspend").forget).toEqual([]);
    expect(installation("unsuspend").installations[0]?.deleted).toBe(false);
    expect(webhookEffects("push", payload(), policy)).toEqual({
      jobs: [],
      installations: [],
      forget: [],
    });
    expect(webhookEffects("issues", { nonsense: true }, policy).jobs).toEqual(
      [],
    );
  });

  it("forgets repositories removed from an installation", () => {
    expect(
      webhookEffects(
        "installation_repositories",
        {
          action: "removed",
          installation: { id: 7 },
          repositories_removed: [{ id: 42 }, { id: 43 }],
        },
        policy,
      ).forget,
    ).toEqual([{ installationId: 7, repoIds: [42, 43] }]);
  });
});
