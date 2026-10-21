import { GitPullRequestIcon, IssueOpenedIcon } from "@primer/octicons-react";
import type { LogEntry } from "@sargunv/rubberstamp-core";

import type { Group } from "../preview.ts";
import { LabelDiff } from "./label.tsx";
import { Ledger, LedgerRow } from "./ledger.tsx";

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
  groups,
  colors,
}: {
  repo: string;
  entries: LogEntry[];
  groups: Group[];
  colors: Map<string, string>;
}) {
  if (entries.length === 0) {
    return <p className="text-muted">No items labeled yet.</p>;
  }
  return (
    <Ledger>
      {entries.map((entry) => (
        <LedgerRow
          key={`${entry.number}-${entry.createdAt}`}
          number={entry.number}
          url={`https://github.com/${repo}/issues/${entry.number}`}
          icon={
            entry.type === "pull request" ? (
              <GitPullRequestIcon
                size={16}
                aria-label="Pull request"
                className="fill-muted"
              />
            ) : entry.type === "issue" ? (
              <IssueOpenedIcon
                size={16}
                aria-label="Issue"
                className="fill-muted"
              />
            ) : null
          }
          title={
            entry.title ?? <span className="text-muted">#{entry.number}</span>
          }
          meta={`Labeled ${when.format(new Date(entry.createdAt))} with ${entry.model}`}
          labels={
            entry.added.length === 0 ? (
              <span className="text-sm text-muted">No labels added</span>
            ) : (
              entry.added.map((name) => (
                <LabelDiff
                  key={name}
                  change={{ name, change: "added" }}
                  color={colors.get(name) ?? "888888"}
                />
              ))
            )
          }
          groups={groups}
          decisions={entry.decisions}
        />
      ))}
    </Ledger>
  );
}
