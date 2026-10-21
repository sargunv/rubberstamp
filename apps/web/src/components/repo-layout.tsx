import type { RepoStatus } from "@sargunv/rubberstamp-core";
import type { ReactNode } from "react";

import { Anchor } from "../ui/link.tsx";
import { Page } from "../ui/page.tsx";
import { ErrorText, Notice } from "../ui/section.tsx";
import { TabLink, TabList } from "../ui/tabs.tsx";
import { CodeSample } from "./code-sample.tsx";
import { GitHubLink } from "./github-link.tsx";

/**
 * A repository's title and tabs around a tab's content. The page and its
 * loading state both render this, so neither can lay out differently.
 */
export function RepoFrame({
  repo,
  tabs,
  children,
}: {
  repo: string;
  tabs: boolean;
  children?: ReactNode;
}) {
  const [owner = "", name = ""] = repo.split("/");
  return (
    <Page
      title={
        <>
          <span className="text-muted">{owner}/</span>
          {name}
        </>
      }
      aside={
        <GitHubLink
          href={`https://github.com/${repo}`}
          label={`${repo} on GitHub`}
        />
      }
    >
      {tabs ? (
        <TabList label="Repository">
          <TabLink
            to="/$owner/$repo"
            params={{ owner, repo: name }}
            activeOptions={{ exact: true }}
          >
            Config
          </TabLink>
          <TabLink to="/$owner/$repo/log" params={{ owner, repo: name }}>
            Log
          </TabLink>
          <TabLink to="/$owner/$repo/preview" params={{ owner, repo: name }}>
            Preview
          </TabLink>
          <TabLink to="/$owner/$repo/ci" params={{ owner, repo: name }}>
            CI
          </TabLink>
        </TabList>
      ) : null}
      {children}
    </Page>
  );
}

/** A repository's page: its tabs, or why it has none. */
export function RepoLayout({
  repo,
  status,
  children,
}: {
  repo: string;
  status: RepoStatus | null;
  children: ReactNode;
}) {
  const ready = status?.status === "ready";
  return (
    <RepoFrame repo={repo} tabs={ready}>
      {ready ? children : <Unready status={status} />}
    </RepoFrame>
  );
}

function Unready({ status }: { status: RepoStatus | null }) {
  if (!status) {
    return (
      <Notice className="mt-8">
        Not found. You need write access to a repository to tune it.
      </Notice>
    );
  }
  switch (status.status) {
    case "not allowed":
      return (
        <Notice className="mt-8">
          Private repositories need an invitation.
        </Notice>
      );
    case "archived":
      return (
        <Notice className="mt-8">
          This repository is archived, so Rubberstamp doesn't label it.
        </Notice>
      );
    case "not installed":
      return (
        <Notice className="mt-8">
          Rubberstamp isn't installed here.{" "}
          <Anchor href={status.installUrl}>Install it</Anchor>
        </Notice>
      );
    case "no config":
      return (
        <section className="mt-8 max-w-xl">
          <Notice>
            No{" "}
            <code className="font-mono text-ink">.config/rubberstamp.yml</code>{" "}
            on the default branch. For example:
          </Notice>
          <CodeSample className="mt-4" caption=".config/rubberstamp.yml">
            {`labels:
  groups:
    kind: { min: 1, max: 1, labels: [bug, feature, chore] }
    area: { labels: ["area:*"] }`}
          </CodeSample>
        </section>
      );
    case "invalid config":
      return (
        <section className="mt-8 max-w-3xl">
          <Notice>
            <code className="font-mono text-ink">.config/rubberstamp.yml</code>{" "}
            has errors:
          </Notice>
          <ul className="mt-3 space-y-1">
            {status.errors.map((error) => (
              <li key={error}>
                <ErrorText className="font-mono">{error}</ErrorText>
              </li>
            ))}
          </ul>
        </section>
      );
    case "ready":
      return null;
  }
}
