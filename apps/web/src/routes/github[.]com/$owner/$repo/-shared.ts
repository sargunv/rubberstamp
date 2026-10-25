import { parseConfig } from "@sargunv/rubberstamp-core";
import { useSuspenseQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";

import { repoQuery } from "../../../../queries.ts";

const route = getRouteApi("/github.com/$owner/$repo");

export function repoName(params: { owner: string; repo: string }): string {
  return `${params.owner}/${params.repo}`;
}

/** The repository a tab is on. Tabs only render once it's ready. */
export function useReadyRepo() {
  const name = repoName(route.useParams());
  const { data: status } = useSuspenseQuery(repoQuery(name));
  if (status?.status !== "ready") {
    throw new Error(`${name} isn't ready for tabs`);
  }
  const parsed = parseConfig(status.config.source);
  // The server only calls a repository ready once its config parses.
  if (!parsed.ok) throw new Error(`${name}'s config doesn't parse`);
  const colors = new Map(status.config.labels.map((l) => [l.name, l.color]));
  return {
    repo: name,
    status,
    config: parsed.config,
    upgraded: parsed.upgraded,
    colors,
  };
}
