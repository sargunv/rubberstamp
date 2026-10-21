import { useState } from "react";

import { percent } from "../format.ts";
import {
  changeCount,
  labelDiff,
  SAMPLE_SIZE,
  type Preview,
  type PreviewItem,
} from "../preview.ts";
import { useRunPreview, type Progress } from "../queries.ts";
import { Button } from "../ui/button.tsx";
import { MetaLine } from "../ui/page.tsx";
import { ProgressBar } from "../ui/progress.tsx";
import { ErrorText, Notice } from "../ui/section.tsx";
import { SegmentedControl } from "../ui/segmented.tsx";
import { ItemState } from "./item-state.tsx";
import { LabelDiff } from "./label.tsx";
import { date, LabelScores, Ledger, LedgerRow } from "./ledger.tsx";

/** The fraction of this month's allowance used so far. */
type Allowance = { used: number };

function runLabel(running: boolean, progress: Progress | undefined) {
  if (!running) return null;
  return progress
    ? `Previewing ${progress.done} of ${progress.total}…`
    : "Previewing…";
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
      <MetaLine>
        <span>
          {preview.items.length} latest items · previewed{" "}
          {date.format(new Date(preview.createdAt))} with {preview.model} · used{" "}
          {percent(share)} of the monthly allowance
        </span>
        <Button
          variant="quiet"
          disabled={running}
          onClick={run}
          className="font-sans"
        >
          {label ?? "Preview again"}
        </Button>
      </MetaLine>
      {running ? (
        <div className="mt-2 max-w-xs">
          <ProgressBar
            done={progress?.done ?? 0}
            total={progress?.total ?? 0}
          />
        </div>
      ) : null}
      {error ? (
        <ErrorText className="mt-2">{error}</ErrorText>
      ) : stale && !running ? (
        <p className="mt-2 text-sm">
          The config has changed since this preview.
        </p>
      ) : null}

      <div className="mt-8 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <SegmentedControl
          label="Show"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: `All ${preview.items.length}` },
            { value: "differ", label: `With changes ${differing.length}` },
          ]}
        />
        <p className="flex gap-4 text-xs text-muted">
          <span>
            <span className="font-mono font-bold text-add">+</span> would add
          </span>
          <span>
            <span className="font-mono font-bold text-drop">−</span> wouldn't
            add
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
            {added > 0 ? <span className="text-add">+{added}</span> : null}
            {added > 0 && dropped > 0 ? " " : null}
            {dropped > 0 ? <span className="text-drop">−{dropped}</span> : null}
          </span>
        ) : null
      }
      icon={<ItemState item={item} />}
      title={item.title}
      meta={`${item.author} · ${date.format(new Date(item.createdAt))}`}
      chips={
        diff.length === 0 ? (
          <Notice className="text-sm">No labels</Notice>
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
      scores={
        <LabelScores
          groups={preview.groups}
          decisions={item.decisions}
          colors={colors}
        />
      }
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
      <Notice>No preview yet.</Notice>
      <Button className="mt-4" disabled={running} onClick={run}>
        {label ?? `Preview latest ${SAMPLE_SIZE} items`}
      </Button>
      {error ? (
        <ErrorText className="mt-3">{error}</ErrorText>
      ) : running ? (
        <div className="mt-4 max-w-56">
          <ProgressBar
            done={progress?.done ?? 0}
            total={progress?.total ?? 0}
          />
        </div>
      ) : (
        <Notice className="mt-3 text-sm">
          Read-only. {percent(allowance.used)} of this month's allowance used.
        </Notice>
      )}
    </section>
  );
}
