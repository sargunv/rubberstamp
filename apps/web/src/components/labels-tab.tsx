import type { Config } from "@sargunv/rubberstamp-core";
import type { ComponentProps } from "react";

import type { Group } from "../preview.ts";
import { Section } from "../ui/section.tsx";
import {
  LabelGroups,
  SharedContext,
  Unconfigured,
} from "./config-sections.tsx";
import { PreviewTab } from "./preview-tab.tsx";

/** The label groups, and what they would do on recent items. */
export function LabelsTab({
  repo,
  path,
  config,
  groups,
  colors,
  warnings,
  preview,
}: {
  repo: string;
  path: string;
  config: Config;
  groups: Group[];
  colors: Map<string, string>;
  warnings: string[];
  /** Null when labels aren't configured, since there's nothing to preview. */
  preview: Omit<ComponentProps<typeof PreviewTab>, "repo"> | null;
}) {
  if (!config.labels || !preview) {
    return (
      <Unconfigured
        example={`labels:
  groups:
    kind: { min: 1, max: 1, labels: [bug, feature, chore] }
    area: { labels: ["area:*"] }`}
      >
        No label groups in the config. Name them to have Rubberstamp label new
        issues and pull requests.
      </Unconfigured>
    );
  }
  return (
    <>
      <SharedContext repo={repo} path={path} context={config.context} />
      <LabelGroups
        config={config}
        groups={groups}
        colors={colors}
        warnings={warnings}
      />
      <Section title="Preview" className="mt-10">
        <div className="mt-2">
          <PreviewTab repo={repo} {...preview} />
        </div>
      </Section>
    </>
  );
}
