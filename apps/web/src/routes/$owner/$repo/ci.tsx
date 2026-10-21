import { parseConfig } from "@sargunv/rubberstamp-core";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { CiTab } from "../../../components/ci-tab.tsx";
import { plansQuery, repoQuery } from "../../../queries.ts";
import { repoName, useReadyRepo } from "./-shared.ts";

export const Route = createFileRoute("/$owner/$repo/ci")({
  loader: async ({ context: { queryClient }, params }) => {
    const name = repoName(params);
    const status = await queryClient.ensureQueryData(repoQuery(name));
    if (status?.status === "ready") {
      await queryClient.ensureQueryData(plansQuery(name));
    }
  },
  component: function Ci() {
    const { repo, status } = useReadyRepo();
    const { data } = useSuspenseQuery(plansQuery(repo));
    const parsed = parseConfig(status.config.source);
    return (
      <CiTab
        repo={repo}
        configured={parsed.ok && parsed.config.ci !== undefined}
        plans={data.plans}
      />
    );
  },
});
