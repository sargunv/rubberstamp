import type { ActivityItem } from "@sargunv/rubberstamp-core";
import { useState, type ReactNode } from "react";

import { Notice } from "../ui/section.tsx";
import { SegmentedControl } from "../ui/segmented.tsx";
import { ItemKindIcon } from "./item-state.tsx";
import { LabelDiff } from "./label.tsx";
import { LabelScores, Ledger, LedgerRow } from "./ledger.tsx";
import { PlanSummary, scored, UnitChip, UnitScores } from "./plan.tsx";

const when = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

type Filter = "all" | "labels" | "ci";

const COLUMN: Record<Filter, string> = {
  all: "Labels and units",
  labels: "Labels",
  ci: "Units",
};

/** What Rubberstamp did on the repository's recent issues and pull requests. */
export function ActivityTab({
  repo,
  items,
  colors,
}: {
  repo: string;
  items: ActivityItem[];
  colors: Map<string, string>;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  if (items.length === 0) {
    return <Notice>Nothing labeled or planned yet.</Notice>;
  }
  const labeled = items.filter((item) => item.labels);
  const planned = items.filter((item) => item.plan);
  const shown =
    filter === "labels" ? labeled : filter === "ci" ? planned : items;
  return (
    <>
      <div className="flex">
        <SegmentedControl
          label="Show"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: `All ${items.length}` },
            { value: "labels", label: `Labeled ${labeled.length}` },
            { value: "ci", label: `Planned ${planned.length}` },
          ]}
        />
      </div>
      <Ledger column={COLUMN[filter]}>
        {shown.map((item) => (
          <ActivityRow
            key={item.number}
            repo={repo}
            item={item}
            filter={filter}
            colors={colors}
          />
        ))}
      </Ledger>
    </>
  );
}

function ActivityRow({
  repo,
  item,
  filter,
  colors,
}: {
  repo: string;
  item: ActivityItem;
  filter: Filter;
  colors: Map<string, string>;
}) {
  const labels = filter !== "ci" ? item.labels : undefined;
  const plan = filter !== "labels" ? item.plan : undefined;
  const running = plan?.decisions.filter((d) => d.run) ?? [];
  const labelScores = labels ? (
    <LabelScores
      groups={labels.groups}
      decisions={labels.decisions}
      colors={colors}
    />
  ) : null;
  const unitScores =
    plan && scored(plan) ? <UnitScores decisions={plan.decisions} /> : null;
  return (
    <LedgerRow
      number={item.number}
      url={`https://github.com/${repo}/issues/${item.number}`}
      icon={<ItemKindIcon type={item.type} />}
      title={item.title}
      meta={
        <>
          {labels ? (
            <span className="block">
              Labeled {when.format(new Date(labels.createdAt))} with{" "}
              {labels.model}
            </span>
          ) : null}
          {plan ? (
            <span className="block">
              <PlanSummary
                repo={repo}
                plan={plan}
                when={when.format(new Date(plan.createdAt))}
              />
            </span>
          ) : null}
        </>
      }
      chips={
        <>
          {labels ? (
            labels.added.length === 0 ? (
              <Notice className="text-sm">No labels added</Notice>
            ) : (
              labels.added.map((name) => (
                <LabelDiff
                  key={name}
                  change={{ name, change: "added" }}
                  done
                  color={colors.get(name) ?? "888888"}
                />
              ))
            )
          ) : null}
          {plan ? (
            running.length === 0 ? (
              <Notice className="text-sm">No units run</Notice>
            ) : (
              running.map((d) => <UnitChip key={d.unit} unit={d.unit} />)
            )
          ) : null}
        </>
      }
      scores={
        labelScores && unitScores ? (
          <div className="space-y-6">
            <ScoresPart title="Labels">{labelScores}</ScoresPart>
            <ScoresPart title="CI units">{unitScores}</ScoresPart>
          </div>
        ) : (
          (labelScores ?? unitScores ?? undefined)
        )
      }
    />
  );
}

function ScoresPart({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold text-muted">{title}</h3>
      {children}
    </section>
  );
}
