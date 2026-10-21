import {
  GitMergeIcon,
  GitPullRequestClosedIcon,
  GitPullRequestDraftIcon,
  GitPullRequestIcon,
  IssueClosedIcon,
  IssueOpenedIcon,
  SkipIcon,
  type Icon,
} from "@primer/octicons-react";

import type { PreviewItem } from "../preview.ts";

type State = { icon: Icon; color: string; label: string };

// GitHub's state colors, as theme tokens.

/** GitHub's icon, color, and name for an issue or pull request's state. */
function state(item: PreviewItem): State {
  if (item.type === "issue") {
    if (item.state === "open")
      return {
        icon: IssueOpenedIcon,
        color: "fill-gh-open",
        label: "Open issue",
      };
    if (item.state === "not planned")
      return {
        icon: SkipIcon,
        color: "fill-muted",
        label: "Closed issue, not planned",
      };
    return {
      icon: IssueClosedIcon,
      color: "fill-gh-done",
      label: "Closed issue",
    };
  }
  if (item.state === "merged")
    return {
      icon: GitMergeIcon,
      color: "fill-gh-done",
      label: "Merged pull request",
    };
  if (item.state === "draft")
    return {
      icon: GitPullRequestDraftIcon,
      color: "fill-muted",
      label: "Draft pull request",
    };
  if (item.state === "closed")
    return {
      icon: GitPullRequestClosedIcon,
      color: "fill-gh-closed",
      label: "Closed pull request",
    };
  return {
    icon: GitPullRequestIcon,
    color: "fill-gh-open",
    label: "Open pull request",
  };
}

export function ItemState({ item }: { item: PreviewItem }) {
  const { icon: StateIcon, color, label } = state(item);
  return (
    <StateIcon size={16} aria-label={label} className={`shrink-0 ${color}`} />
  );
}

/** An issue or pull request icon, when its state isn't known. */
export function ItemKindIcon({ type }: { type: "issue" | "pull request" }) {
  return type === "pull request" ? (
    <GitPullRequestIcon
      size={16}
      aria-label="Pull request"
      className="fill-muted"
    />
  ) : (
    <IssueOpenedIcon size={16} aria-label="Issue" className="fill-muted" />
  );
}
