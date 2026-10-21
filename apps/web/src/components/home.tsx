import { LockIcon, RepoIcon } from "@primer/octicons-react";
import type { RepoList } from "@sargunv/rubberstamp-core";
import { Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";

import { Header } from "./header.tsx";
import { ListSkeleton } from "./skeleton.tsx";

function HomeShell({ children }: { children: ReactNode }) {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-5 pt-10 pb-24 sm:px-8">
        <h1 className="font-display text-5xl leading-none font-extrabold tracking-[0.01em] sm:text-6xl">
          Repositories
        </h1>
        {children}
      </main>
    </>
  );
}

export function HomeSkeleton() {
  return (
    <HomeShell>
      <div className="mt-8">
        <ListSkeleton />
      </div>
    </HomeShell>
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
      <HomeShell>
        <p className="mt-6 text-muted">
          No repositories you can write to have Rubberstamp installed.{" "}
          <a
            href={list.installUrl}
            className="rounded-[2px] text-ink underline underline-offset-4"
          >
            Install it
          </a>
        </p>
      </HomeShell>
    );
  }

  return (
    <HomeShell>
      <div className="mt-8 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a repository"
          aria-label="Find a repository"
          // The page exists to pick one, so typing should start the search.
          autoFocus
          className="w-full max-w-sm rounded-[3px] border border-rule bg-sheet px-3 py-2 font-mono text-sm outline-none placeholder:font-sans placeholder:text-muted focus:border-violet"
        />
        <a
          href={list.installUrl}
          className="rounded-[2px] text-sm text-muted underline-offset-4 hover:text-ink hover:underline"
        >
          Add repositories
        </a>
      </div>

      {matches.length === 0 ? (
        <p className="mt-8 text-muted">No repositories match.</p>
      ) : (
        [...owners].map(([owner, repos]) => (
          <section key={owner} className="mt-10">
            <h2 className="flex items-baseline gap-2 border-b border-rule pb-2 font-mono text-sm">
              {owner}
              <span className="font-sans text-xs text-muted">
                {repos.length}
              </span>
            </h2>
            <ul className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
              {repos.map((repo) => {
                const name = repo.name.slice(owner.length + 1);
                return (
                  <li key={repo.name} className="border-b border-rule">
                    <Link
                      to="/$owner/$repo"
                      params={{ owner, repo: name }}
                      className="flex items-center gap-2 py-2.5 font-mono text-sm hover:text-violet"
                    >
                      {repo.private ? (
                        <LockIcon size={16} className="shrink-0 fill-muted" />
                      ) : (
                        <RepoIcon size={16} className="shrink-0 fill-muted" />
                      )}
                      <span className="truncate">{name}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </HomeShell>
  );
}
