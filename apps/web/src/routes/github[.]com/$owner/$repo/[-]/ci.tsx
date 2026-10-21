import { createFileRoute } from "@tanstack/react-router";

import { useReadyRepo } from "../-shared.ts";
import { CiTab } from "../../../../../components/ci-tab.tsx";

export const Route = createFileRoute("/github.com/$owner/$repo/-/ci")({
  component: function Ci() {
    const { repo, status, config } = useReadyRepo();
    return <CiTab repo={repo} path={status.config.path} config={config} />;
  },
});
