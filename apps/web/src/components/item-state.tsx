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

/** GitHub's icon, color, and name for an issue or pull request's state. */
function state(item: PreviewItem): State {
  if (item.type === "issue") {
    if (item.state === "open")
      return {
        icon: IssueOpenedIcon,
        color: "var(--gh-open)",
        label: "Open issue",
      };
    if (item.state === "not planned")
      return {
        icon: SkipIcon,
        color: "var(--muted)",
        label: "Closed issue, not planned",
      };
    return {
      icon: IssueClosedIcon,
      color: "var(--gh-done)",
      label: "Closed issue",
    };
  }
  if (item.state === "merged")
    return {
      icon: GitMergeIcon,
      color: "var(--gh-done)",
      label: "Merged pull request",
    };
  if (item.state === "draft")
    return {
      icon: GitPullRequestDraftIcon,
      color: "var(--muted)",
      label: "Draft pull request",
    };
  if (item.state === "closed")
    return {
      icon: GitPullRequestClosedIcon,
      color: "var(--gh-closed)",
      label: "Closed pull request",
    };
  return {
    icon: GitPullRequestIcon,
    color: "var(--gh-open)",
    label: "Open pull request",
  };
}

export function ItemState({ item }: { item: PreviewItem }) {
  const { icon: StateIcon, color, label } = state(item);
  return (
    <StateIcon size={16} aria-label={label} fill={color} className="shrink-0" />
  );
}
