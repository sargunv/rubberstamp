import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { LabelsTab } from "../../../components/labels-tab.tsx";
import { previewQuery, repoQuery } from "../../../queries.ts";
import { repoName, useReadyRepo } from "./-shared.ts";

export const Route = createFileRoute("/$owner/$repo/labels")({
  loader: async ({ context: { queryClient }, params }) => {
    const name = repoName(params);
    const status = await queryClient.ensureQueryData(repoQuery(name));
    if (status?.status === "ready") {
      await queryClient.ensureQueryData(previewQuery(name));
    }
  },
  component: function Labels() {
    const { repo, status, config, colors } = useReadyRepo();
    const { data } = useSuspenseQuery(previewQuery(repo));
    return (
      <LabelsTab
        repo={repo}
        path={status.config.path}
        config={config}
        groups={status.config.groups}
        colors={colors}
        warnings={status.config.warnings}
        preview={{
          preview: data.preview,
          config: status.config.source,
          share: data.share,
          allowance: status.allowance,
        }}
      />
    );
  },
});
