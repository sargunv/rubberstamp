import type { RepoStatus } from "@sargunv/rubberstamp-core";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { Header } from "./header.tsx";

/** A repository's header, name, and tabs, around a tab's content. */
export function RepoShell({
  repo,
  tabs,
  children,
}: {
  repo: string;
  tabs: boolean;
  children: ReactNode;
}) {
  const [owner = "", name = ""] = repo.split("/");
  return (
    <>
      <Header repo={repo} />
      <main className="mx-auto max-w-6xl px-5 pt-10 pb-24 sm:px-8">
        <h1 className="font-display text-5xl leading-none font-extrabold tracking-[0.01em] sm:text-6xl">
          <span className="text-muted">{owner}/</span>
          {name}
        </h1>
        {tabs ? (
          <nav
            aria-label="Repository"
            className="mt-6 mb-8 flex gap-6 border-b border-rule text-sm"
          >
            <Tab to="/$owner/$repo" params={{ owner, repo: name }}>
              Config
            </Tab>
            <Tab to="/$owner/$repo/log" params={{ owner, repo: name }}>
              Log
            </Tab>
            <Tab to="/$owner/$repo/preview" params={{ owner, repo: name }}>
              Preview
            </Tab>
          </nav>
        ) : null}
        {children}
      </main>
    </>
  );
}

/** A repository's page: its name, then tabs or why it has none. */
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
    <RepoShell repo={repo} tabs={ready}>
      {ready ? children : <Unready status={status} />}
    </RepoShell>
  );
}

function Tab({
  to,
  params,
  children,
}: {
  to: "/$owner/$repo" | "/$owner/$repo/log" | "/$owner/$repo/preview";
  params: { owner: string; repo: string };
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      params={params}
      activeOptions={{ exact: true }}
      className="-mb-px border-b-2 border-transparent pb-2 text-muted hover:text-ink data-[status=active]:border-violet data-[status=active]:text-ink"
    >
      {children}
    </Link>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return <p className="mt-8 max-w-xl text-muted">{children}</p>;
}

function Unready({ status }: { status: RepoStatus | null }) {
  if (!status) {
    return (
      <Notice>
        Not found. You need write access to a repository to tune it.
      </Notice>
    );
  }
  switch (status.status) {
    case "not allowed":
      return <Notice>Private repositories need an invitation.</Notice>;
    case "archived":
      return (
        <Notice>
          This repository is archived, so Rubberstamp doesn't label it.
        </Notice>
      );
    case "not installed":
      return (
        <Notice>
          Rubberstamp isn't installed here.{" "}
          <a
            href={status.installUrl}
            className="rounded-[2px] text-ink underline underline-offset-4"
          >
            Install it
          </a>
        </Notice>
      );
    case "no config":
      return <NoConfig />;
    case "invalid config":
      return (
        <section className="mt-8 max-w-3xl">
          <p className="text-muted">
            <code className="font-mono text-ink">.config/rubberstamp.yml</code>{" "}
            has errors:
          </p>
          <ul className="mt-3 space-y-1 font-mono text-sm text-(--drop)">
            {status.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </section>
      );
    case "ready":
      return null;
  }
}

function NoConfig() {
  return (
    <section className="mt-8 max-w-xl">
      <p className="text-muted">
        No <code className="font-mono text-ink">.config/rubberstamp.yml</code>{" "}
        on the default branch. For example:
      </p>
      <figure className="mt-4 overflow-hidden rounded-[3px] border border-rule bg-sheet">
        <figcaption className="border-b border-rule px-4 py-2 font-mono text-xs text-muted">
          .config/rubberstamp.yml
        </figcaption>
        <pre className="overflow-x-auto px-4 py-3 font-mono text-sm leading-relaxed">
          {`labels:
  groups:
    kind: { min: 1, max: 1, labels: [bug, feature, chore] }
    area: { labels: ["area:*"] }`}
        </pre>
      </figure>
    </section>
  );
}
