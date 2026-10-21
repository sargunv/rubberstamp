import { Collapsible } from "@base-ui/react/collapsible";
import type { ReactNode } from "react";

import { requirement, type Group } from "../preview.ts";
import { DisclosurePanel, DisclosureTrigger } from "../ui/disclosure.tsx";
import { Anchor } from "../ui/link.tsx";
import { DescribedLabel } from "./label.tsx";

export const date = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
});

type Decision = {
  label: string;
  group: string;
  add: boolean;
  score: number;
  rule: string;
};

/** Ruled rows of items, numbered in a red margin like a ledger. */
export function Ledger({ children }: { children: ReactNode }) {
  return (
    <div className="ledger relative mt-3 border-t border-rule">
      <div
        aria-hidden
        className="hidden border-b border-rule py-2 text-xs text-muted lg:grid lg:grid-cols-[var(--mcol)_1fr_22rem_5.5rem]"
      >
        <span />
        <span className="pl-5">Item</span>
        <span>Labels</span>
        <span />
      </div>
      <ol>{children}</ol>
    </div>
  );
}

/** One item: its number, title, labels, and Jev's scores on demand. */
export function LedgerRow({
  number,
  url,
  margin,
  icon,
  title,
  meta,
  labels,
  groups,
  decisions,
  colors,
}: {
  number: number;
  url: string;
  /** Under the number, such as the item's label changes. */
  margin?: ReactNode;
  icon: ReactNode;
  title: ReactNode;
  meta: ReactNode;
  labels: ReactNode;
  /** Without groups, the row has no scores to show. */
  groups?: Group[];
  decisions?: Decision[];
  /** Label colors by name, for the scores. */
  colors?: Map<string, string>;
}) {
  return (
    <Collapsible.Root
      render={<li />}
      className="grid grid-cols-[var(--mcol)_1fr] border-b border-rule lg:grid-cols-[var(--mcol)_1fr_22rem_5.5rem]"
    >
      <div className="py-4 pr-2.5 text-right font-mono text-sm text-muted lg:pr-3">
        <Anchor href={url} variant="quiet">
          #{number}
        </Anchor>
        {margin}
      </div>

      <div className="flex min-w-0 gap-2 py-4 pr-4 pl-5">
        {/* The title's first line box, so the icon centers on it. */}
        <span className="flex h-[1.375rem] shrink-0 items-center pt-px">
          {icon}
        </span>
        <div className="min-w-0">
          <Anchor
            href={url}
            variant="plain"
            className="leading-snug font-medium text-pretty"
          >
            {title}
          </Anchor>
          <p className="mt-1 text-xs text-muted">{meta}</p>
        </div>
      </div>

      <div className="col-start-2 flex flex-wrap content-start items-center gap-x-2 gap-y-1.5 pb-3 pl-5 lg:col-start-auto lg:py-4 lg:pl-0">
        {labels}
      </div>

      {groups && decisions ? (
        <>
          <div className="col-start-2 pb-4 pl-5 lg:col-start-auto lg:flex lg:items-start lg:justify-end lg:py-4 lg:pl-0">
            <DisclosureTrigger className="-ml-1.5 px-1.5 py-0.5 lg:-mr-1.5 lg:ml-0">
              Scores
            </DisclosureTrigger>
          </div>

          <DisclosurePanel className="col-span-full col-start-2">
            <div className="grid gap-x-10 gap-y-6 pt-1 pb-6 pl-5 sm:grid-cols-2 lg:grid-cols-3">
              {groups.map((g) => (
                <GroupScores
                  key={g.id}
                  group={g}
                  decisions={decisions.filter((d) => d.group === g.id)}
                  colors={colors ?? new Map()}
                />
              ))}
            </div>
          </DisclosurePanel>
        </>
      ) : null}
    </Collapsible.Root>
  );
}

function GroupScores({
  group,
  decisions,
  colors,
}: {
  group: Group;
  decisions: Decision[];
  colors: Map<string, string>;
}) {
  const meanings = new Map(group.labels.map((l) => [l.name, l.meaning]));
  const sorted = decisions.toSorted((a, b) => b.score - a.score);
  const note =
    sorted.find((d) => d.add && d.rule)?.rule ??
    sorted.find((d) => d.rule === "group labeled" || d.rule === "present")
      ?.rule;
  return (
    <section>
      <h3 className="flex items-baseline justify-between gap-3 border-b border-rule pb-1">
        <span className="font-mono text-sm font-medium">{group.id}</span>
        <span className="text-xs text-muted">
          {requirement(group)} · threshold {group.threshold.toFixed(2)}
        </span>
      </h3>
      <ul className="mt-2 space-y-1.5">
        {sorted.map((d) => (
          <li
            key={d.label}
            className="grid grid-cols-[minmax(0,9rem)_1fr_2.5rem] items-center gap-3 text-xs"
          >
            <span className={`min-w-0 ${d.add ? "" : "opacity-55"}`}>
              <DescribedLabel
                name={d.label}
                color={colors.get(d.label) ?? "ededed"}
                meaning={meanings.get(d.label) ?? "No description"}
              />
            </span>
            <span className="relative h-1.5 rounded-full bg-rule">
              <span
                className={`absolute inset-y-0 left-0 rounded-full ${d.add ? "bg-violet" : "bg-muted/50"}`}
                style={{ width: `${Math.max(d.score * 100, 1)}%` }}
              />
              <span
                aria-hidden
                className="absolute -inset-y-1 w-px bg-ink"
                style={{ left: `${group.threshold * 100}%` }}
              />
            </span>
            <span className="text-right font-mono tabular-nums">
              {d.score.toFixed(2)}
            </span>
          </li>
        ))}
      </ul>
      {note === "filled to min" ? (
        <p className="mt-2 text-xs text-muted">
          Nothing passed, so the most likely label was added to reach the
          minimum of {group.min}.
        </p>
      ) : note === "group labeled" || note === "present" ? (
        <p className="mt-2 text-xs text-muted">
          The item already had a label from this group, so Rubberstamp left it
          alone.
        </p>
      ) : note === "cut by max" ? (
        <p className="mt-2 text-xs text-muted">
          More passed than the maximum of {group.max}, so the least likely were
          left off.
        </p>
      ) : null}
    </section>
  );
}
