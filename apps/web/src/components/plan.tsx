import type { PlanEntry, UnitDecision } from "@sargunv/rubberstamp-core";

import { Anchor } from "../ui/link.tsx";
import { ScoreBar } from "./ledger.tsx";

/** Whether Jev's scores decided the plan, rather than one rule for every unit. */
export function scored(plan: PlanEntry): boolean {
  return plan.decisions.some((d) => d.score !== null);
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
  // Without scores, one rule ran every unit, and it's the whole story.
  return scored(plan) ? (
    <>
      Planned {commit} {when} with {plan.model}
    </>
  ) : (
    <>
      Every unit for {commit} {when}: {plan.decisions[0]?.rule}
    </>
  );
}

/** Each unit's score against its threshold, and any rule that forced it. */
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
          {d.rule ? (
            <span className="col-start-2 -mt-1 text-muted">
              Runs regardless: {d.rule}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
