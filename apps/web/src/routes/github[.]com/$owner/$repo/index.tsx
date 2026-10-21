import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { ActivityTab } from "../../../../components/activity-tab.tsx";
import { activityQuery, repoQuery } from "../../../../queries.ts";
import { repoName, useReadyRepo } from "./-shared.ts";

export const Route = createFileRoute("/github.com/$owner/$repo/")({
  loader: async ({ context: { queryClient }, params }) => {
    const name = repoName(params);
    const status = await queryClient.ensureQueryData(repoQuery(name));
    if (status?.status === "ready") {
      await queryClient.ensureQueryData(activityQuery(name));
    }
  },
  component: function Activity() {
    const { repo, colors } = useReadyRepo();
    const { data } = useSuspenseQuery(activityQuery(repo));
    return <ActivityTab repo={repo} items={data.items} colors={colors} />;
  },
});
