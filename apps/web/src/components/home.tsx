import type { RepoList } from "@sargunv/rubberstamp-core";
import { useState } from "react";

import { TextInput } from "../ui/input.tsx";
import { Anchor, AppLink } from "../ui/link.tsx";
import { Page } from "../ui/page.tsx";
import { PendingBar } from "../ui/progress.tsx";
import { Notice } from "../ui/section.tsx";
import { RepoGrid } from "./repo-grid.tsx";

export function HomePending() {
  return (
    <Page title="Repositories">
      <PendingBar />
    </Page>
  );
}

/** The repositories the signed-in user can tune, grouped by owner. */
export function Home({ list }: { list: RepoList }) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const matches = list.repos.filter((r) =>
    r.name.toLowerCase().includes(needle),
  );
  const owners = Map.groupBy(matches, (r) => r.name.split("/")[0] ?? "");

  if (list.repos.length === 0) {
    return (
      <Page title="Repositories">
        <Notice className="mt-6">
          No repositories you can write to have Rubberstamp installed.{" "}
          <Anchor href={list.installUrl}>Install it</Anchor>
        </Notice>
      </Page>
    );
  }

  return (
    <Page title="Repositories">
      <div className="mt-8 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <TextInput
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a repository"
          aria-label="Find a repository"
          // The page exists to pick one, so typing should start the search.
          autoFocus
          className="w-full max-w-sm"
        />
        <Anchor href={list.installUrl} variant="quiet" className="text-sm">
          Add repositories
        </Anchor>
      </div>

      {matches.length === 0 ? (
        <Notice className="mt-8">No repositories match.</Notice>
      ) : (
        [...owners].map(([owner, repos]) => (
          <section key={owner} className="mt-10">
            <h2 className="flex items-baseline gap-2 pb-2 font-mono text-sm">
              <AppLink to="/github/$owner" params={{ owner }} variant="name">
                {owner}
              </AppLink>
              <span className="font-sans text-xs text-muted">
                {repos.length}
              </span>
            </h2>
            <RepoGrid owner={owner} repos={repos} />
          </section>
        ))
      )}
    </Page>
  );
}
