import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { LogTab } from "../../../components/log-tab.tsx";
import { logQuery, repoQuery } from "../../../queries.ts";
import { repoName, useReadyRepo } from "./-shared.ts";

export const Route = createFileRoute("/$owner/$repo/log")({
  loader: async ({ context: { queryClient }, params }) => {
    const name = repoName(params);
    const status = await queryClient.ensureQueryData(repoQuery(name));
    if (status?.status === "ready") {
      await queryClient.ensureQueryData(logQuery(name));
    }
  },
  component: function Log() {
    const { repo, colors } = useReadyRepo();
    const { data } = useSuspenseQuery(logQuery(repo));
    return <LogTab repo={repo} entries={data.entries} colors={colors} />;
  },
});
