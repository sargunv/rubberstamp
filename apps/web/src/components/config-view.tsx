import { Tooltip } from "@base-ui/react/tooltip";
import { parseConfig } from "@sargunv/rubberstamp-core";
import { useState } from "react";

import type { Group } from "../preview.ts";
import { requirement } from "../preview.ts";
import { Button } from "../ui/button.tsx";
import { Anchor } from "../ui/link.tsx";
import { Section } from "../ui/section.tsx";
import { DescribedLabel } from "./label.tsx";

/** The config's context, two lines until expanded. */
function Context({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="grid gap-x-6 gap-y-1 border-b border-rule py-3 md:grid-cols-[12rem_1fr]">
      <dt className="font-mono text-sm font-medium">context</dt>
      <dd className="max-w-3xl text-sm text-muted">
        <p className={expanded ? "" : "line-clamp-2"}>{text}</p>
        <Button
          variant="quiet"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
          className="mt-1 text-xs"
        >
          {expanded ? "Show less" : "Show all"}
        </Button>
      </dd>
    </div>
  );
}

/** A repository's label groups and CI units, with what Jev reads about each. */
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
  const context = config?.labels?.context ?? config?.context;
  const overridden = new Set(Object.keys(config?.labels?.describe ?? {}));
  return (
    <section aria-labelledby="config-heading">
      <h2
        id="config-heading"
        className="border-b border-rule pb-2 text-sm font-semibold"
      >
        Config{" "}
        <Anchor
          href={`https://github.com/${repo}/blob/HEAD/${path}`}
          variant="quiet"
          className="ml-1 font-mono text-xs font-normal"
        >
          {path}
        </Anchor>
      </h2>

      <Tooltip.Provider delay={150}>
        <dl>
          {context ? <Context text={context.trim()} /> : null}
          {groups.map((group) => (
            <div
              key={group.id}
              className="grid gap-x-6 gap-y-2 border-b border-rule py-3 md:grid-cols-[12rem_1fr]"
            >
              <dt>
                <span className="font-mono text-sm font-medium">
                  {group.id}
                </span>
                <span className="mt-0.5 block text-xs text-muted">
                  {requirement(group)} · threshold {group.threshold.toFixed(2)}
                </span>
              </dt>
              <dd>
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
              </dd>
            </div>
          ))}
        </dl>
      </Tooltip.Provider>
      {config?.ci ? (
        <Section title="CI units" className="mt-10">
          <dl className="mt-2 border-t border-rule">
            {config.ci.context ? (
              <Context text={config.ci.context.trim()} />
            ) : null}
            {Object.entries(config.ci.units).map(([id, unit]) => (
              <div
                key={id}
                className="grid gap-x-6 gap-y-2 border-b border-rule py-3 md:grid-cols-[12rem_1fr]"
              >
                <dt className="font-mono text-sm font-medium">{id}</dt>
                <dd className="max-w-3xl text-sm">
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
                </dd>
              </div>
            ))}
          </dl>
        </Section>
      ) : null}
      {warnings.length > 0 ? (
        <ul className="mt-6 space-y-1 text-sm">
          {warnings.map((warning) => (
            <li key={warning} className="text-muted">
              <span className="font-semibold text-ink">Warning:</span> {warning}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
