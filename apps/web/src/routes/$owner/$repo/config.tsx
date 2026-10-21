import { createFileRoute } from "@tanstack/react-router";

import { ConfigView } from "../../../components/config-view.tsx";
import { useReadyRepo } from "./-shared.ts";

export const Route = createFileRoute("/$owner/$repo/config")({
  component: function Config() {
    const { repo, status, colors } = useReadyRepo();
    return (
      <ConfigView
        repo={repo}
        source={status.config.source}
        groups={status.config.groups}
        colors={colors}
        warnings={status.config.warnings}
      />
    );
  },
});
