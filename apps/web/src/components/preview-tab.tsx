import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { useState, type ReactNode } from "react";

import { percent } from "../format.ts";
import {
  changeCount,
  labelDiff,
  SAMPLE_SIZE,
  type Preview,
  type PreviewItem,
} from "../preview.ts";
import { useRunPreview, type Progress } from "../queries.ts";
import { ItemState } from "./item-state.tsx";
import { LabelDiff } from "./label.tsx";
import { date, Ledger, LedgerRow } from "./ledger.tsx";

/** The fraction of this month's allowance used so far. */
type Allowance = { used: number };

function runLabel(running: boolean, progress: Progress | undefined) {
  if (!running) return null;
  return progress
    ? `Previewing ${progress.done} of ${progress.total}…`
    : "Previewing…";
}

/** A thin bar for a running preview, filled by judged items. */
function ProgressBar({ progress }: { progress: Progress | undefined }) {
  const fraction =
    progress && progress.total > 0 ? progress.done / progress.total : 0;
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={progress?.total ?? 0}
      aria-valuenow={progress?.done ?? 0}
      className="h-0.5 w-full overflow-hidden rounded-full bg-rule"
    >
      <div
        className="h-full bg-violet transition-[width] duration-300 motion-reduce:transition-none"
        style={{ width: `${fraction * 100}%` }}
      />
    </div>
  );
}

export function PreviewTab({
  repo,
  preview,
  config,
  share,
  allowance,
}: {
  repo: string;
  preview: Preview | null;
  /** The config on the default branch now. */
  config: string;
  /** The fraction of the monthly allowance the preview spent. */
  share: number | null;
  allowance: Allowance;
}) {
  return preview ? (
    <PreviewView
      repo={repo}
      preview={preview}
      stale={preview.config !== config}
      share={share ?? 0}
    />
  ) : (
    <NoPreview repo={repo} allowance={allowance} />
  );
}

function PreviewView({
  repo,
  preview,
  stale,
  share,
}: {
  repo: string;
  preview: Preview;
  stale: boolean;
  share: number;
}) {
  const { run, running, progress, error } = useRunPreview(repo);
  const label = runLabel(running, progress);
  const [filter, setFilter] = useState<"all" | "differ">("all");
  const colors = new Map(preview.labels.map((l) => [l.name, l.color]));
  const differing = preview.items.filter((i) => {
    const { added, dropped } = changeCount(labelDiff(i, preview.groups));
    return added + dropped > 0;
  });
  const shown = filter === "all" ? preview.items : differing;
  return (
    <>
      <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 font-mono text-xs text-muted">
        <span>
          {preview.items.length} latest items · previewed{" "}
          {date.format(new Date(preview.createdAt))} with {preview.model} · used{" "}
          {percent(share)} of the monthly allowance
        </span>
        <button
          type="button"
          disabled={running}
          onClick={run}
          className="rounded-[2px] font-sans text-ink underline-offset-4 hover:underline disabled:text-muted disabled:no-underline"
        >
          {label ?? "Preview again"}
        </button>
      </p>
      {running ? (
        <div className="mt-2 max-w-xs">
          <ProgressBar progress={progress} />
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-sm text-(--drop)">
          {error}
        </p>
      ) : stale && !running ? (
        <p className="mt-2 text-sm text-ink">
          The config has changed since this preview.
        </p>
      ) : null}

      <div className="mt-8 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <ToggleGroup
          value={[filter]}
          onValueChange={(value) => {
            const next = value[0];
            if (next === "all" || next === "differ") setFilter(next);
          }}
          aria-label="Show"
          className="flex rounded-[3px] border border-rule bg-sheet p-0.5"
        >
          <FilterToggle value="all">All {preview.items.length}</FilterToggle>
          <FilterToggle value="differ">
            With changes {differing.length}
          </FilterToggle>
        </ToggleGroup>
        <p className="flex gap-4 text-xs text-muted">
          <span>
            <span className="font-mono font-bold text-(--add)">+</span> would
            add
          </span>
          <span>
            <span className="font-mono font-bold text-(--drop)">−</span>{" "}
            wouldn't add
          </span>
        </p>
      </div>

      <Ledger>
        {shown.map((item) => (
          <PreviewRow
            key={item.number}
            item={item}
            preview={preview}
            colors={colors}
          />
        ))}
      </Ledger>
    </>
  );
}

function FilterToggle({
  value,
  children,
}: {
  value: string;
  children: ReactNode;
}) {
  return (
    <Toggle
      value={value}
      className="rounded-[2px] px-3 py-1 text-sm text-muted hover:text-ink data-pressed:bg-ink data-pressed:text-paper"
    >
      {children}
    </Toggle>
  );
}

function PreviewRow({
  item,
  preview,
  colors,
}: {
  item: PreviewItem;
  preview: Preview;
  colors: Map<string, string>;
}) {
  const diff = labelDiff(item, preview.groups);
  const { added, dropped } = changeCount(diff);
  return (
    <LedgerRow
      number={item.number}
      url={item.url}
      margin={
        added + dropped > 0 ? (
          <span className="mt-1 block text-xs font-medium">
            {added > 0 ? <span className="text-(--add)">+{added}</span> : null}
            {added > 0 && dropped > 0 ? " " : null}
            {dropped > 0 ? (
              <span className="text-(--drop)">−{dropped}</span>
            ) : null}
          </span>
        ) : null
      }
      icon={<ItemState item={item} />}
      title={item.title}
      meta={`${item.author} · ${date.format(new Date(item.createdAt))}`}
      labels={
        diff.length === 0 ? (
          <span className="text-sm text-muted">No labels</span>
        ) : (
          diff.map((change) => (
            <LabelDiff
              key={change.name}
              change={change}
              color={colors.get(change.name) ?? "888888"}
            />
          ))
        )
      }
      groups={preview.groups}
      decisions={item.decisions}
      colors={colors}
    />
  );
}

function NoPreview({
  repo,
  allowance,
}: {
  repo: string;
  allowance: Allowance;
}) {
  const { run, running, progress, error } = useRunPreview(repo);
  const label = runLabel(running, progress);
  return (
    <section className="max-w-xl">
      <p className="text-muted">No preview yet.</p>
      <button
        type="button"
        disabled={running}
        onClick={run}
        className="mt-4 rounded-[3px] bg-violet px-4 py-2.5 font-semibold text-on-violet hover:bg-[color-mix(in_oklch,var(--violet),var(--ink)_18%)] disabled:opacity-60"
      >
        {label ?? `Preview latest ${SAMPLE_SIZE} items`}
      </button>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-(--drop)">
          {error}
        </p>
      ) : running ? (
        <div className="mt-4 max-w-56">
          <ProgressBar progress={progress} />
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted">
          Read-only. {percent(allowance.used)} of this month's allowance used.
        </p>
      )}
    </section>
  );
}
