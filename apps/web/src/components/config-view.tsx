import { Tooltip } from "@base-ui/react/tooltip";
import { parseConfig } from "@sargunv/rubberstamp-core";
import { useState, type ReactNode } from "react";

import type { Group } from "../preview.ts";
import { requirement } from "../preview.ts";
import { Button } from "../ui/button.tsx";
import { Anchor } from "../ui/link.tsx";
import { Section } from "../ui/section.tsx";
import { DescribedLabel } from "./label.tsx";

/** The context Jev reads before what follows, two lines until expanded. */
function Context({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="mt-2 max-w-3xl text-sm text-muted">
      <p className={expanded ? "" : "line-clamp-2"}>{text.trim()}</p>
      <Button
        variant="quiet"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
        className="mt-1 text-xs"
      >
        {expanded ? "Show less" : "Show all"}
      </Button>
    </div>
  );
}

/** A section of the config: its own context, then one row per entry. */
function ConfigSection({
  title,
  context,
  warnings = [],
  children,
}: {
  title: string;
  context: string | undefined;
  warnings?: string[];
  children: ReactNode;
}) {
  return (
    <Section title={title} className="mt-10">
      {context ? <Context text={context} /> : null}
      <dl className="mt-4 border-t border-rule">{children}</dl>
      {warnings.length > 0 ? (
        <ul className="mt-6 space-y-1 text-sm">
          {warnings.map((warning) => (
            <li key={warning} className="text-muted">
              <span className="font-semibold text-ink">Warning:</span> {warning}
            </li>
          ))}
        </ul>
      ) : null}
    </Section>
  );
}

/** One entry, keyed by its id in the config. */
function Entry({
  id,
  detail,
  children,
}: {
  id: string;
  detail?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-x-6 gap-y-2 border-b border-rule py-3 md:grid-cols-[12rem_1fr]">
      <dt>
        <span className="font-mono text-sm font-medium">{id}</span>
        {detail ? (
          <span className="mt-0.5 block text-xs text-muted">{detail}</span>
        ) : null}
      </dt>
      <dd className="max-w-3xl text-sm">{children}</dd>
    </div>
  );
}

/** A repository's config: label groups and CI units, with what Jev reads. */
export function ConfigView({
  repo,
  path,
  source,
  groups,
  colors,
  warnings,
}: {
  repo: string;
  path: string;
  source: string;
  groups: Group[];
  colors: Map<string, string>;
  warnings: string[];
}) {
  const parsed = parseConfig(source);
  const config = parsed.ok ? parsed.config : undefined;
  const overridden = new Set(Object.keys(config?.labels?.describe ?? {}));
  return (
    <div>
      <h2 className="border-b border-rule pb-2 text-sm font-semibold">
        Config{" "}
        <Anchor
          href={`https://github.com/${repo}/blob/HEAD/${path}`}
          variant="quiet"
          className="ml-1 font-mono text-xs font-normal"
        >
          {path}
        </Anchor>
      </h2>
      {config?.context ? <Context text={config.context} /> : null}

      {config?.labels ? (
        <ConfigSection
          title="Label groups"
          context={config.labels.context}
          warnings={warnings}
        >
          <Tooltip.Provider delay={150}>
            {groups.map((group) => (
              <Entry
                key={group.id}
                id={group.id}
                detail={`${requirement(group)} · threshold ${group.threshold.toFixed(2)}`}
              >
                <ul className="flex flex-wrap gap-1.5">
                  {group.labels.map((label) => (
                    <li key={label.name}>
                      <DescribedLabel
                        name={label.name}
                        color={colors.get(label.name) ?? "888888"}
                        meaning={label.meaning}
                        fromConfig={overridden.has(label.name)}
                      />
                    </li>
                  ))}
                </ul>
              </Entry>
            ))}
          </Tooltip.Provider>
        </ConfigSection>
      ) : null}

      {config?.ci ? (
        <ConfigSection title="CI units" context={config.ci.context}>
          {Object.entries(config.ci.units).map(([id, unit]) => (
            <Entry key={id} id={id}>
              <p className="text-muted">{unit.covers}</p>
              {unit.paths.length > 0 ? (
                <p className="mt-2 text-xs text-muted">
                  Always runs for changes to{" "}
                  {unit.paths.map((path, i) => (
                    <span key={path}>
                      {i > 0 ? ", " : null}
                      <code className="font-mono text-ink">{path}</code>
                    </span>
                  ))}
                </p>
              ) : null}
            </Entry>
          ))}
        </ConfigSection>
      ) : null}
    </div>
  );
}
