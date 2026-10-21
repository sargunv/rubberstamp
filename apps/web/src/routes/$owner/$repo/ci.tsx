import { createFileRoute } from "@tanstack/react-router";

import { CiTab } from "../../../components/ci-tab.tsx";
import { useReadyRepo } from "./-shared.ts";

export const Route = createFileRoute("/$owner/$repo/ci")({
  component: function Ci() {
    const { repo, status, config } = useReadyRepo();
    return <CiTab repo={repo} path={status.config.path} config={config} />;
  },
});
