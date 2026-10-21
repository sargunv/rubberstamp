import type { PlanEntry, UnitDecision } from "@sargunv/rubberstamp-core";

import { Anchor } from "../ui/link.tsx";
import { Notice } from "../ui/section.tsx";
import { CodeSample } from "./code-sample.tsx";
import { ItemKindIcon } from "./item-state.tsx";
import { Ledger, LedgerRow, ScoreBar } from "./ledger.tsx";

const when = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** Which CI units Rubberstamp planned for recent pull request pushes. */
export function CiTab({
  repo,
  configured,
  plans,
}: {
  repo: string;
  /** Whether the config names any CI units. */
  configured: boolean;
  plans: PlanEntry[];
}) {
  if (!configured) {
    return (
      <section className="max-w-xl">
        <Notice>
          No CI units in the config. Name them to have Rubberstamp plan which
          ones each pull request needs. For example:
        </Notice>
        <CodeSample className="mt-4" caption=".config/rubberstamp.yml">
          {`ci:
  units:
    linux:
      covers: Builds and runs every test suite on Linux.
    docs:
      covers: Builds the documentation site.
      paths: ["docs/*"]`}
        </CodeSample>
      </section>
    );
  }
  if (plans.length === 0) {
    return <Notice>No pull requests planned yet.</Notice>;
  }
  return (
    <Ledger column="Units">
      {plans.map((plan) => {
        const running = plan.decisions.filter((d) => d.run);
        return (
          <LedgerRow
            key={`${plan.number}-${plan.head}`}
            number={plan.number}
            url={`https://github.com/${repo}/pull/${plan.number}`}
            icon={<ItemKindIcon type="pull request" />}
            title={plan.title}
            meta={<PlanMeta repo={repo} plan={plan} />}
            chips={
              running.length === 0 ? (
                <Notice className="text-sm">No units run</Notice>
              ) : (
                running.map((d) => (
                  <span
                    key={d.unit}
                    className="rounded-sm border border-rule px-1.5 py-0.5 font-mono text-xs"
                  >
                    {d.unit}
                  </span>
                ))
              )
            }
            scores={
              plan.model === null ? undefined : (
                <UnitScores decisions={plan.decisions} />
              )
            }
          />
        );
      })}
    </Ledger>
  );
}

function PlanMeta({ repo, plan }: { repo: string; plan: PlanEntry }) {
  const commit = (
    <Anchor
      href={`https://github.com/${repo}/pull/${plan.number}/commits/${plan.head}`}
      variant="plain"
      className="font-mono"
    >
      {plan.head.slice(0, 7)}
    </Anchor>
  );
  const time = when.format(new Date(plan.createdAt));
  // Without a model, one rule ran every unit, and it's the whole story.
  const rule = plan.decisions[0]?.rule;
  return plan.model === null ? (
    <>
      Every unit for {commit} on {time}: {rule}
    </>
  ) : (
    <>
      Planned {commit} on {time} with {plan.model}
    </>
  );
}

/** Each unit's score against its threshold, and any rule that forced it. */
function UnitScores({ decisions }: { decisions: UnitDecision[] }) {
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
