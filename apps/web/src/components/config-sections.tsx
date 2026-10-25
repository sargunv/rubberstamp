import { Tooltip } from "@base-ui/react/tooltip";
import {
  ciUnits,
  ruleText,
  type Config,
  type Rule,
} from "@sargunv/rubberstamp-core";
import { useState, type ReactNode } from "react";

import type { Group } from "../preview.ts";
import { requirement } from "../preview.ts";
import { Button } from "../ui/button.tsx";
import { Anchor } from "../ui/link.tsx";
import { Notice, Section } from "../ui/section.tsx";
import { CodeSample } from "./code-sample.tsx";
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
  intro,
  warnings = [],
  children,
}: {
  title: string;
  context: string | undefined;
  /** Settings for the whole section, shown before its entries. */
  intro?: ReactNode;
  warnings?: string[];
  children: ReactNode;
}) {
  return (
    <Section title={title} className="mt-10">
      {context ? <Context text={context} /> : null}
      {intro}
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

/** Why a feature's tab is empty, and how to turn the feature on. */
export function Unconfigured({
  children,
  example,
}: {
  children: ReactNode;
  example: string;
}) {
  return (
    <section className="max-w-xl">
      <Notice>{children} For example:</Notice>
      <CodeSample className="mt-4" caption=".config/rubberstamp.yml">
        {example}
      </CodeSample>
    </section>
  );
}

/** The context every feature shares, and the file it comes from. */
export function SharedContext({
  repo,
  path,
  context,
  upgraded,
}: {
  repo: string;
  path: string;
  context: string | undefined;
  /** The config as version 1, when the file is an older version. */
  upgraded: string | undefined;
}) {
  return (
    <div>
      <p className="text-xs text-muted">
        From{" "}
        <Anchor
          href={`https://github.com/${repo}/blob/HEAD/${path}`}
          variant="quiet"
          className="font-mono"
        >
          {path}
        </Anchor>
        {context ? ", with context for every feature:" : null}
      </p>
      {context ? <Context text={context} /> : null}
      {upgraded === undefined ? null : (
        <details className="mt-4 max-w-3xl">
          <summary className="cursor-pointer text-sm text-muted">
            This config has no{" "}
            <code className="font-mono text-ink">version</code>, so Rubberstamp
            reads it as version 0. Show it as version 1.
          </summary>
          <CodeSample className="mt-2" caption={path}>
            {upgraded}
          </CodeSample>
        </details>
      )}
    </div>
  );
}

/** Rules in the order they're checked, before the score decides. */
function Rules({ rules }: { rules: Rule[] }) {
  if (rules.length === 0) return null;
  return (
    <ol className="mt-2 list-inside list-decimal space-y-0.5 text-xs text-muted">
      {rules.map((rule, i) => (
        <li key={i}>{ruleText(rule)}</li>
      ))}
    </ol>
  );
}

/** The labels in a group's config that have rules of their own. */
function groupLabelRules(config: Config, id: string): [string, Rule[]][] {
  const labels = config.labels?.groups[id]?.labels ?? {};
  return Object.entries(labels)
    .filter(([, entry]) => entry.rules.length > 0)
    .map(([name, entry]) => [name, entry.rules]);
}

/** The label groups, with what Jev reads about each label. */
export function LabelGroups({
  config,
  groups,
  colors,
  warnings,
}: {
  config: Config;
  groups: Group[];
  colors: Map<string, string>;
  warnings: string[];
}) {
  return (
    <ConfigSection
      title="Label groups"
      context={config.labels?.context}
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
                    fromConfig={label.fromConfig ?? false}
                  />
                </li>
              ))}
            </ul>
            <Rules rules={config.labels?.groups[group.id]?.rules ?? []} />
            {groupLabelRules(config, group.id).map(([name, rules]) => (
              <div key={name} className="mt-2">
                <span className="font-mono text-xs">{name}</span>
                <Rules rules={rules} />
              </div>
            ))}
          </Entry>
        ))}
      </Tooltip.Provider>
    </ConfigSection>
  );
}

/** The workflow whose successes count as its units passing, if any. */
function CiWorkflow({
  repo,
  workflow,
}: {
  repo: string;
  workflow: string | undefined;
}) {
  return (
    <p className="mt-4 max-w-3xl text-sm text-muted">
      {workflow === undefined ? (
        <>
          No <code className="font-mono text-ink">workflow</code> names the one
          that gates jobs on these units, so Rubberstamp records no passes and
          judges every push on the whole pull request.
        </>
      ) : (
        <>
          Units pass when{" "}
          <Anchor
            href={`https://github.com/${repo}/blob/HEAD/${workflow}`}
            variant="quiet"
            className="font-mono"
          >
            {workflow}
          </Anchor>{" "}
          succeeds, and each push is judged on what changed since a unit last
          passed.
        </>
      )}
    </p>
  );
}

/** The CI units, with what Jev reads about each. */
export function CiUnits({ repo, config }: { repo: string; config: Config }) {
  return (
    <ConfigSection
      title="CI units"
      context={config.ci?.context}
      intro={<CiWorkflow repo={repo} workflow={config.ci?.workflow} />}
    >
      {ciUnits(config).map((unit) => (
        <Entry
          key={unit.id}
          id={unit.id}
          detail={`threshold ${unit.threshold.toFixed(2)}`}
        >
          <p className="text-muted">{unit.covers}</p>
          <Rules rules={unit.rules} />
        </Entry>
      ))}
    </ConfigSection>
  );
}
