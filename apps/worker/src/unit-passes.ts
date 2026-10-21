import type { Store } from "./store.ts";
import type { SucceededRun } from "./webhooks.ts";

/**
 * Records that every unit a successful run executed passed at its pull
 * request's head, if the run's plan step asked Rubberstamp. Whether it passes
 * is the run's only outcome GitHub reports without scanning its jobs.
 */
export async function recordPasses(
  run: SucceededRun,
  store: Pick<Store, "findRun" | "savePasses">,
): Promise<boolean> {
  const asked = await store.findRun(run.repoId, run.runId, run.attempt);
  // Anyone can ask for a public repository's plan in a run's name, so a run
  // that built another commit can't vouch for this one.
  if (asked === null || asked.head !== run.head) return false;
  await store.savePasses(asked);
  return true;
}
