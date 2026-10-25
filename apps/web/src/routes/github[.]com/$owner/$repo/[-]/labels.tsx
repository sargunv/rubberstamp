import { parseConfig } from "@sargunv/rubberstamp-core";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ComponentProps } from "react";

import { repoName, useReadyRepo } from "../-shared.ts";
import { LabelsTab } from "../../../../../components/labels-tab.tsx";
import { previewQuery, repoQuery } from "../../../../../queries.ts";

export const Route = createFileRoute("/github.com/$owner/$repo/-/labels")({
  loader: async ({ context: { queryClient }, params }) => {
    const name = repoName(params);
    const status = await queryClient.ensureQueryData(repoQuery(name));
    // Reading a preview keeps it from expiring, so only read one that shows.
    if (status?.status === "ready" && labelsConfigured(status.config.source)) {
      await queryClient.ensureQueryData(previewQuery(name));
    }
  },
  component: function Labels() {
    const { repo, status, config, upgraded, colors } = useReadyRepo();
    const tab = {
      repo,
      path: status.config.path,
      config,
      upgraded,
      groups: status.config.groups,
      colors,
      warnings: status.config.warnings,
    };
    return config.labels ? (
      <WithPreview {...tab} />
    ) : (
      <LabelsTab {...tab} preview={null} />
    );
  },
});

function labelsConfigured(source: string): boolean {
  const parsed = parseConfig(source);
  return parsed.ok && parsed.config.labels !== undefined;
}

function WithPreview(tab: Omit<ComponentProps<typeof LabelsTab>, "preview">) {
  const { status } = useReadyRepo();
  const { data } = useSuspenseQuery(previewQuery(tab.repo));
  return (
    <LabelsTab
      {...tab}
      preview={{
        preview: data.preview,
        config: status.config.source,
        share: data.share,
        allowance: status.allowance,
      }}
    />
  );
}
