import { Tooltip } from "@base-ui/react/tooltip";
import { parseConfig } from "@sargunv/rubberstamp-core";
import { useState } from "react";

import type { Group } from "../preview.ts";
import { Label } from "./label.tsx";

/** How many labels a group takes, in words. */
function requirement(group: Group): string {
  const { min, max } = group;
  if (max === 1) return min > 0 ? "Exactly one" : "At most one";
  if (min > 0 && max !== undefined) return `${min} to ${max}`;
  if (min > 1) return `At least ${min}`;
  if (min === 1) return "At least one";
  if (max !== undefined) return `Up to ${max}`;
  return group.labels.length === 1 ? "Optional" : "Any";
}

/** A label that shows the description Jev reads when hovered or focused. */
function DescribedLabel({
  name,
  color,
  meaning,
  fromConfig,
}: {
  name: string;
  color: string;
  meaning: string;
  fromConfig: boolean;
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        render={<span tabIndex={0} />}
        className="inline-flex rounded-full"
      >
        <Label name={name} color={color} />
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner sideOffset={6}>
          <Tooltip.Popup className="max-w-sm rounded-[3px] border border-rule bg-sheet px-3 py-2 text-sm shadow-[0_8px_24px_-12px_rgb(0_0_0/0.35)] transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0">
            {meaning}
            <span className="mt-1 block text-xs text-muted">
              {fromConfig ? "From describe in the config" : "From GitHub"}
            </span>
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

/** The config's context, two lines until expanded. */
function Context({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="grid gap-x-6 gap-y-1 border-b border-rule py-3 md:grid-cols-[12rem_1fr]">
      <dt className="font-mono text-sm font-medium">context</dt>
      <dd className="max-w-3xl text-sm text-muted">
        <p className={expanded ? "" : "line-clamp-2"}>{text}</p>
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
          className="mt-1 rounded-[2px] text-xs text-ink underline-offset-4 hover:underline"
        >
          {expanded ? "Show less" : "Show all"}
        </button>
      </dd>
    </div>
  );
}

/** A repository's label groups, with what Jev reads about each label. */
export function ConfigView({
  repo,
  source,
  groups,
  colors,
  warnings,
}: {
  repo: string;
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
        <a
          href={`https://github.com/${repo}/blob/HEAD/.github/rubberstamp.yml`}
          className="ml-1 rounded-[2px] font-mono text-xs font-normal text-muted hover:text-ink hover:underline"
        >
          .github/rubberstamp.yml
        </a>
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
