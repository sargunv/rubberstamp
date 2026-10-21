import { Combobox } from "@base-ui/react/combobox";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";

import { meQuery, reposQuery, useSignOut } from "../queries.ts";

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block rounded-[3px] border-2 border-violet px-1.5 pt-0.5 font-display text-lg leading-none font-extrabold tracking-[0.08em] text-violet uppercase outline-1 outline-offset-2 outline-violet ${className}`}
    >
      Rubberstamp
    </span>
  );
}

/** The site header, showing the account and repository a page is about. */
export function Header({ owner, repo }: { owner?: string; repo?: string }) {
  const account = repo?.split("/")[0] ?? owner;
  const me = useQuery(meQuery).data;
  const signOut = useSignOut();
  return (
    <header className="border-b border-rule">
      <div className="mx-auto flex max-w-6xl items-center gap-5 px-5 py-3 sm:px-8">
        <Link to="/" aria-label="Rubberstamp home" className="rounded-[3px]">
          <Wordmark />
        </Link>
        {account ? (
          <nav
            aria-label="Breadcrumb"
            className="flex min-w-0 items-center font-mono text-sm"
          >
            {repo ? (
              <Link
                to="/$owner"
                params={{ owner: account }}
                className="rounded-[3px] px-1 py-1 text-muted hover:text-ink hover:underline"
              >
                {account}
              </Link>
            ) : (
              <span aria-current="page" className="px-1 py-1">
                {account}
              </span>
            )}
            {repo ? (
              <>
                <span aria-hidden className="text-muted">
                  /
                </span>
                <RepoSwitcher repo={repo} />
              </>
            ) : null}
          </nav>
        ) : null}
        <div className="ml-auto flex items-center gap-3">
          {me ? (
            <img
              src={me.avatarUrl}
              alt={me.login}
              title={me.login}
              className="size-7 rounded-full border border-rule"
            />
          ) : null}
          <button
            type="button"
            disabled={signOut.isPending}
            onClick={() => signOut.mutate()}
            className="rounded-[3px] text-sm text-muted underline-offset-4 hover:text-ink hover:underline"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}

/** The current repository, and a searchable list to switch to another. */
function RepoSwitcher({ repo }: { repo: string }) {
  const navigate = useNavigate();
  // The list loads without blocking the page; it's only for switching.
  const names = useQuery(reposQuery).data?.repos.map((r) => r.name) ?? [];
  return (
    <Combobox.Root
      items={names}
      value={repo}
      onValueChange={(next) => {
        if (!next || next === repo) return;
        const [owner = "", name = ""] = next.split("/");
        void navigate({ to: "/$owner/$repo", params: { owner, repo: name } });
      }}
    >
      <Combobox.Trigger
        aria-label="Switch repository"
        className="flex min-w-0 items-center gap-1.5 rounded-[3px] px-1.5 py-1 text-ink hover:bg-sheet data-popup-open:bg-sheet"
      >
        <span className="truncate">{repo.split("/")[1]}</span>
        <Chevron />
      </Combobox.Trigger>
      <Combobox.Portal>
        <Combobox.Positioner sideOffset={6} align="start">
          <Combobox.Popup
            aria-label="Switch repository"
            className="w-80 max-w-(--available-width) overflow-hidden rounded-[3px] border border-rule bg-sheet shadow-[0_8px_24px_-12px_rgb(0_0_0/0.35)]"
          >
            <Combobox.Input
              placeholder="Find a repository"
              className="w-full border-b border-rule bg-transparent px-3 py-2 font-mono text-sm outline-none placeholder:font-sans placeholder:text-muted"
            />
            <Combobox.Empty>
              <p className="px-3 py-3 text-sm text-muted">No matches.</p>
            </Combobox.Empty>
            <Combobox.List className="max-h-[min(20rem,var(--available-height))] overflow-auto overscroll-contain p-1 empty:p-0">
              {(name: string) => {
                const [owner, short] = name.split("/");
                return (
                  <Combobox.Item
                    key={name}
                    value={name}
                    className="flex cursor-default items-center justify-between gap-4 rounded-[2px] px-2.5 py-1.5 font-mono text-sm outline-none data-highlighted:bg-violet data-highlighted:text-on-violet"
                  >
                    <span className="truncate">
                      <span className="opacity-60">{owner}/</span>
                      {short}
                    </span>
                    {name === repo ? (
                      <span className="font-sans text-xs">current</span>
                    ) : null}
                  </Combobox.Item>
                );
              }}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}

export function Chevron({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden
      className={`size-3 shrink-0 ${className}`}
    >
      <path
        d="M3 4.5 6 7.5 9 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}
