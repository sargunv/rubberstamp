import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { PreviewTab } from "../../../components/preview-tab.tsx";
import { LedgerSkeleton } from "../../../components/skeleton.tsx";
import { previewQuery, repoQuery } from "../../../queries.ts";
import { repoName, useReadyRepo } from "./-shared.ts";

export const Route = createFileRoute("/$owner/$repo/preview")({
  loader: async ({ context: { queryClient }, params }) => {
    const name = repoName(params);
    const status = await queryClient.ensureQueryData(repoQuery(name));
    if (status?.status === "ready") {
      await queryClient.ensureQueryData(previewQuery(name));
    }
  },
  pendingComponent: LedgerSkeleton,
  component: function Preview() {
    const { repo, status } = useReadyRepo();
    const { data } = useSuspenseQuery(previewQuery(repo));
    return (
      <PreviewTab
        repo={repo}
        preview={data.preview}
        config={status.config.source}
        share={data.share}
        allowance={status.allowance}
      />
    );
  },
});
