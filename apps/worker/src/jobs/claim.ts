import type { Claim, Store } from "../store.ts";

/**
 * Run `spend` only if this job claims the work first, so a duplicate delivery
 * running at the same time doesn't pay for it again. A failure releases the
 * claim for the queue's retry. Null when another job holds the claim.
 */
export async function claimed<T>(
  store: Store,
  claim: Claim,
  spend: () => Promise<T>,
): Promise<T | null> {
  if (!(await store.claim(claim))) return null;
  try {
    return await spend();
  } catch (error) {
    await store.release(claim);
    throw error;
  }
}
