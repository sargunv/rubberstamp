import { LockIcon, RepoIcon } from "@primer/octicons-react";
import type { RepoList } from "@sargunv/rubberstamp-core";
import { Link } from "@tanstack/react-router";

import { Header } from "./header.tsx";

/** The repositories the signed-in user can tune. */
export function Home({ list }: { list: RepoList }) {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-5 pt-10 pb-24 sm:px-8">
        <h1 className="font-display text-5xl leading-none font-extrabold tracking-[0.01em] sm:text-6xl">
          Repositories
        </h1>
        {list.repos.length === 0 ? (
          <p className="mt-6 text-muted">
            No repositories you can write to have Rubberstamp installed.{" "}
            <a
              href={list.installUrl}
              className="rounded-[2px] text-ink underline underline-offset-4"
            >
              Install it
            </a>
          </p>
        ) : (
          <ul className="mt-8 border-t border-rule">
            {list.repos.map((repo) => {
              const [owner = "", name = ""] = repo.name.split("/");
              return (
                <li key={repo.name} className="border-b border-rule">
                  <Link
                    to="/$owner/$repo"
                    params={{ owner, repo: name }}
                    className="flex items-center gap-2 py-3 font-mono text-sm hover:bg-sheet"
                  >
                    {repo.private ? (
                      <LockIcon size={16} className="fill-muted" />
                    ) : (
                      <RepoIcon size={16} className="fill-muted" />
                    )}
                    <span className="text-muted">{owner}/</span>
                    {name}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-6 text-sm text-muted">
          Missing one?{" "}
          <a
            href={list.installUrl}
            className="rounded-[2px] text-ink underline-offset-4 hover:underline"
          >
            Add it to the installation
          </a>
        </p>
      </main>
    </>
  );
}
