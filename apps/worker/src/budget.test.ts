import * as v from "valibot";
import { describe, expect, it } from "vite-plus/test";

import { Budgets, budgetFor, budgetPeriod } from "./budget.ts";

describe("budgets", () => {
  const budgets = v.parse(Budgets, {
    installation: 24_000_000,
    global: 240_000_000,
    accounts: { MapLibre: 72_000_000 },
  });

  it("applies account overrides without regard to case", () => {
    expect(budgetFor(budgets, "maplibre")).toEqual({
      installation: 72_000_000,
      global: 240_000_000,
    });
    expect(budgetFor(budgets, "someone").installation).toBe(24_000_000);
  });

  it("allows no overrides, and rejects fractional or negative tokens", () => {
    expect(v.parse(Budgets, { installation: 1, global: 2 }).accounts).toEqual(
      {},
    );
    expect(v.safeParse(Budgets, { installation: 1.5, global: 2 }).success).toBe(
      false,
    );
    expect(v.safeParse(Budgets, { installation: -1, global: 2 }).success).toBe(
      false,
    );
  });

  it("counts usage by UTC month", () => {
    expect(budgetPeriod(new Date("2026-10-31T23:59:59Z"))).toBe("2026-10");
    expect(budgetPeriod(new Date("2026-11-01T00:00:00Z"))).toBe("2026-11");
  });
});
