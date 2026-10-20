import { describe, expect, it } from "vite-plus/test";

import { webhookEffects } from "./webhooks.ts";

const policy = { privateAllowlist: new Set(["sargunv"]) };

function payload(overrides: { private?: boolean; owner?: string } = {}) {
  return {
    action: "opened",
    installation: { id: 7 },
    repository: {
      id: 42,
      full_name: `${overrides.owner ?? "maplibre"}/maplibre-native-ffi`,
      private: overrides.private ?? false,
      owner: { login: overrides.owner ?? "maplibre" },
    },
    sender: { login: "someone", type: "User" },
    pull_request: { number: 12, updated_at: "2026-10-20T00:00:00Z" },
    issue: { number: 13, updated_at: "2026-10-20T00:00:00Z" },
  };
}

describe("webhookEffects", () => {
  it("labels newly opened issues and pull requests", () => {
    expect(webhookEffects("pull_request", payload(), policy).jobs).toEqual([
      {
        type: "label",
        installationId: 7,
        repoId: 42,
        repo: "maplibre/maplibre-native-ffi",
        number: 12,
      },
    ]);
    expect(webhookEffects("issues", payload(), policy).jobs[0]?.number).toBe(
      13,
    );
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

  it("records label changes and who made them", () => {
    const effects = webhookEffects(
      "issues",
      {
        ...payload(),
        action: "unlabeled",
        label: { name: "bug" },
        sender: { login: "rubberstamp[bot]", type: "Bot" },
      },
      policy,
    );
    expect(effects.jobs).toEqual([]);
    expect(effects.labelEvents).toEqual([
      {
        repoId: 42,
        number: 13,
        label: "bug",
        action: "unlabeled",
        actor: "rubberstamp[bot]",
        actorIsBot: true,
        at: "2026-10-20T00:00:00Z",
      },
    ]);
  });

  it("tracks installations and ignores other events", () => {
    expect(
      webhookEffects(
        "installation",
        {
          action: "deleted",
          installation: { id: 7, account: { login: "maplibre" } },
        },
        policy,
      ).installations,
    ).toEqual([{ id: 7, account: "maplibre", deleted: true }]);
    expect(webhookEffects("push", payload(), policy)).toEqual({
      jobs: [],
      labelEvents: [],
      installations: [],
    });
    expect(webhookEffects("issues", { nonsense: true }, policy).jobs).toEqual(
      [],
    );
  });
});
