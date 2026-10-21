import * as v from "valibot";

const Tokens = v.pipe(v.number(), v.integer(), v.minValue(0));

/** Monthly Jev input-token budgets, from the `BUDGETS` var. */
export const Budgets = v.object({
  installation: Tokens,
  global: Tokens,
  accounts: v.optional(v.record(v.string(), Tokens), {}),
});

export type Budgets = v.InferOutput<typeof Budgets>;

export type Budget = { installation: number; global: number };

export function budgetFor(budgets: Budgets, account: string): Budget {
  const override = Object.entries(budgets.accounts).find(
    ([name]) => name.toLowerCase() === account.toLowerCase(),
  );
  return {
    installation: override?.[1] ?? budgets.installation,
    global: budgets.global,
  };
}

/** The UTC calendar month that usage counts against, such as `2026-10`. */
export function budgetPeriod(now: Date): string {
  return now.toISOString().slice(0, 7);
}
