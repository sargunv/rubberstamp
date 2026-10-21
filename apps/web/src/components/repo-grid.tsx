import { LockIcon, RepoIcon } from "@primer/octicons-react";

import { AppLink } from "../ui/link.tsx";

/** One account's repositories as a compact, ruled grid of links. */
export function RepoGrid({
  owner,
  repos,
}: {
  owner: string;
  repos: { name: string; private: boolean }[];
}) {
  return (
    <ul className="grid gap-x-8 border-t border-rule sm:grid-cols-2 lg:grid-cols-3">
      {repos.map((repo) => {
        const name = repo.name.slice(owner.length + 1);
        return (
          <li key={repo.name} className="border-b border-rule">
            <AppLink
              to="/github/$owner/$repo"
              params={{ owner, repo: name }}
              variant="name"
              className="flex items-center gap-2 py-2.5 text-sm"
            >
              {repo.private ? (
                <LockIcon
                  size={16}
                  aria-label="Private"
                  className="shrink-0 fill-muted"
                />
              ) : (
                <RepoIcon
                  size={16}
                  aria-hidden
                  className="shrink-0 fill-muted"
                />
              )}
              <span className="truncate">{name}</span>
            </AppLink>
          </li>
        );
      })}
    </ul>
  );
}
