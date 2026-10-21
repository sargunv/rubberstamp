import type { Config } from "@sargunv/rubberstamp-core";

import { CiUnits, SharedContext, Unconfigured } from "./config-sections.tsx";

/** The CI units Rubberstamp chooses among for each pull request. */
export function CiTab({
  repo,
  path,
  config,
}: {
  repo: string;
  path: string;
  config: Config;
}) {
  if (!config.ci) {
    return (
      <Unconfigured
        example={`ci:
  units:
    linux:
      covers: Builds and runs every test suite on Linux.
    docs:
      covers: Builds the documentation site.
      paths: ["docs/*"]`}
      >
        No CI units in the config. Name them to have Rubberstamp plan which ones
        each pull request needs.
      </Unconfigured>
    );
  }
  return (
    <>
      <SharedContext repo={repo} path={path} context={config.context} />
      <CiUnits config={config} />
    </>
  );
}
