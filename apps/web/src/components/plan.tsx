import type { PlanEntry, UnitDecision } from "@sargunv/rubberstamp-core";

import { Anchor } from "../ui/link.tsx";
import { ScoreBar } from "./ledger.tsx";

/** Whether one rule ran every unit, rather than the plan deciding each. */
export function ruled(plan: PlanEntry): boolean {
  const [first] = plan.decisions;
  return plan.decisions.every(
    (d) => d.run && d.score === null && d.rule === first?.rule,
  );
}

/** A CI unit as a chip, the way labels are. */
export function UnitChip({ unit }: { unit: string }) {
  return (
    <span className="rounded-sm border border-rule px-1.5 py-0.5 font-mono text-xs">
      {unit}
    </span>
  );
}

/** Which head a plan judged, and what decided it. */
export function PlanSummary({
  repo,
  plan,
  when,
}: {
  repo: string;
  plan: PlanEntry;
  when: string;
}) {
  const commit = (
    <Anchor
      href={`https://github.com/${repo}/pull/${plan.number}/commits/${plan.head}`}
      variant="plain"
      className="font-mono"
    >
      {plan.head.slice(0, 7)}
    </Anchor>
  );
  // When one rule ran every unit, it's the whole story.
  return ruled(plan) ? (
    <>
      Every unit for {commit} {when}: {plan.decisions[0]?.rule}
    </>
  ) : (
    <>
      Planned {commit} {when}
      {plan.model === null ? null : ` with ${plan.model}`}
    </>
  );
}

/** What decided a unit besides its score, and what it was judged on. */
function UnitNote({ decision: d }: { decision: UnitDecision }) {
  const rule = d.rule
    ? `${d.run ? "Runs regardless" : "Skipped"}: ${d.rule}`
    : "";
  // A rule that skipped a unit since its pass already names the commit.
  const since =
    d.since !== undefined && d.score !== null
      ? `since ${d.since.slice(0, 7)}`
      : "";
  if (!rule && !since) return null;
  return (
    <span className="col-start-2 -mt-1 text-muted">
      {rule && since
        ? `${rule}; judged ${since}`
        : rule || `Judged on changes ${since}`}
    </span>
  );
}

/** Each unit's score against its threshold, and any rule that decided it. */
export function UnitScores({ decisions }: { decisions: UnitDecision[] }) {
  return (
    <ul className="max-w-xl space-y-1.5">
      {decisions.map((d) => (
        <li
          key={d.unit}
          className="grid grid-cols-[minmax(0,9rem)_1fr_2.5rem] items-center gap-3 text-xs"
        >
          <span
            className={`min-w-0 truncate font-mono ${d.run ? "" : "opacity-55"}`}
          >
            {d.unit}
          </span>
          <ScoreBar
            score={d.score ?? 0}
            threshold={d.threshold}
            passed={d.run}
          />
          <span className="text-right font-mono tabular-nums">
            {d.score === null ? "" : d.score.toFixed(2)}
          </span>
          <UnitNote decision={d} />
        </li>
      ))}
    </ul>
  );
}
