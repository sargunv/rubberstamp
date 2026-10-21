import { describe, expect, it } from "vite-plus/test";

import type { CiRun } from "./store.ts";
import { FakeStore } from "./testing.ts";
import { recordPasses } from "./unit-passes.ts";

const HEAD = "a".repeat(40);
const NEXT = "b".repeat(40);

const asked: CiRun = {
  installationId: 1,
  repoId: 2,
  runId: 9001,
  attempt: 1,
  number: 3,
  head: HEAD,
  base: "base123",
  units: ["linux", "macos"],
};

const succeeded = { repoId: 2, runId: 9001, attempt: 1, head: HEAD };

describe("recordPasses", () => {
  it("records a pass for each unit the run executed", async () => {
    const store = new FakeStore();
    await store.saveRun(asked);

    expect(await recordPasses(succeeded, store)).toBe(true);
    expect(await store.lastPasses(2, 3)).toEqual(
      new Map([
        ["linux", { head: HEAD, base: "base123", at: store.now }],
        ["macos", { head: HEAD, base: "base123", at: store.now }],
      ]),
    );
  });

  it("ignores a run whose plan step never asked", async () => {
    const store = new FakeStore();
    await store.saveRun(asked);

    expect(await recordPasses({ ...succeeded, runId: 9002 }, store)).toBe(
      false,
    );
    expect(await recordPasses({ ...succeeded, attempt: 2 }, store)).toBe(false);
    expect(store.passes).toEqual([]);
  });

  it("ignores a run that built another commit than it asked about", async () => {
    const store = new FakeStore();
    await store.saveRun(asked);

    expect(await recordPasses({ ...succeeded, head: NEXT }, store)).toBe(false);
    expect(store.passes).toEqual([]);
  });

  it("counts a successful re-run attempt", async () => {
    const store = new FakeStore();
    await store.saveRun({ ...asked, attempt: 2 });

    expect(await recordPasses({ ...succeeded, attempt: 2 }, store)).toBe(true);
    expect((await store.lastPasses(2, 3)).get("linux")?.head).toBe(HEAD);
  });

  it("records a redelivered run once", async () => {
    const store = new FakeStore();
    await store.saveRun(asked);
    await recordPasses(succeeded, store);
    await recordPasses(succeeded, store);
    expect(store.passes).toHaveLength(2);
  });
});

describe("lastPasses", () => {
  it("keeps each unit's most recent pass for the pull request", async () => {
    const store = new FakeStore();
    await store.savePasses(asked);
    store.now = "2026-10-22T00:00:00Z";
    await store.savePasses({
      ...asked,
      runId: 9002,
      head: NEXT,
      units: ["linux"],
    });
    // Another pull request's passes don't count.
    await store.savePasses({ ...asked, runId: 9003, number: 4, head: NEXT });

    expect(await store.lastPasses(2, 3)).toEqual(
      new Map([
        ["linux", { head: NEXT, base: "base123", at: "2026-10-22T00:00:00Z" }],
        ["macos", { head: HEAD, base: "base123", at: "2026-10-21T00:00:00Z" }],
      ]),
    );
  });
});
