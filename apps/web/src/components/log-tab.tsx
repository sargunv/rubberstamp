import type { LogEntry } from "@sargunv/rubberstamp-core";

import { Notice } from "../ui/section.tsx";
import { ItemKindIcon } from "./item-state.tsx";
import { LabelDiff } from "./label.tsx";
import { LabelScores, Ledger, LedgerRow } from "./ledger.tsx";

const when = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** What Rubberstamp did on the repository's recent items. */
export function LogTab({
  repo,
  entries,
  colors,
}: {
  repo: string;
  entries: LogEntry[];
  colors: Map<string, string>;
}) {
  if (entries.length === 0) {
    return <Notice>No items labeled yet.</Notice>;
  }
  return (
    <Ledger>
      {entries.map((entry) => (
        <LedgerRow
          key={`${entry.number}-${entry.createdAt}`}
          number={entry.number}
          url={`https://github.com/${repo}/issues/${entry.number}`}
          icon={<ItemKindIcon type={entry.type} />}
          title={entry.title}
          meta={`Labeled ${when.format(new Date(entry.createdAt))} with ${entry.model}`}
          chips={
            entry.added.length === 0 ? (
              <Notice className="text-sm">No labels added</Notice>
            ) : (
              entry.added.map((name) => (
                <LabelDiff
                  key={name}
                  change={{ name, change: "added" }}
                  done
                  color={colors.get(name) ?? "888888"}
                />
              ))
            )
          }
          scores={
            <LabelScores
              groups={entry.groups}
              decisions={entry.decisions}
              colors={colors}
            />
          }
        />
      ))}
    </Ledger>
  );
}
