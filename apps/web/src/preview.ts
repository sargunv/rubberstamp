import type {
  Preview,
  PreviewGroup as Group,
  PreviewItem,
} from "@sargunv/rubberstamp-core";

export type { Group, Preview, PreviewItem };

/** How many of a repository's newest items a preview labels. */
export const SAMPLE_SIZE = 20;

export type LabelChange = {
  name: string;
  /**
   * `kept`: on GitHub and Rubberstamp's pick. `added`: Rubberstamp's pick but
   * not on GitHub. `dropped`: on GitHub but not Rubberstamp's pick. `outside`:
   * on GitHub and in no label group, so Rubberstamp never judges it.
   */
  change: "kept" | "added" | "dropped" | "outside";
  /** Why Rubberstamp added a label that didn't pass its threshold. */
  rule?: string;
};

/** The item's labels on GitHub against Rubberstamp's picks, by kind of change. */
export function labelDiff(item: PreviewItem, groups: Group[]): LabelChange[] {
  const grouped = new Set(groups.flatMap((g) => g.labels.map((l) => l.name)));
  const picks = new Map(
    item.decisions.filter((d) => d.add).map((d) => [d.label, d.rule]),
  );
  const now: LabelChange[] = item.labels.map((name) => ({
    name,
    change: !grouped.has(name)
      ? "outside"
      : picks.has(name)
        ? "kept"
        : "dropped",
  }));
  const added: LabelChange[] = [...picks]
    .filter(([name]) => !item.labels.includes(name))
    .map(([name, rule]) =>
      rule ? { name, change: "added", rule } : { name, change: "added" },
    );
  const order = { kept: 0, dropped: 1, added: 2, outside: 3 };
  return [...now, ...added].sort((a, b) => order[a.change] - order[b.change]);
}

export function changeCount(diff: LabelChange[]) {
  return {
    added: diff.filter((d) => d.change === "added").length,
    dropped: diff.filter((d) => d.change === "dropped").length,
  };
}
