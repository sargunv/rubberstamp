import { Menu } from "@base-ui/react/menu";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

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

export function Header({ repo }: { repo?: string }) {
  const me = useQuery(meQuery).data;
  // Only the repository menu needs the list, so it loads without blocking.
  const repos =
    useQuery({ ...reposQuery, enabled: repo !== undefined }).data?.repos ?? [];
  const signOut = useSignOut();
  return (
    <header className="border-b border-rule">
      <div className="mx-auto flex max-w-6xl items-center gap-5 px-5 py-3 sm:px-8">
        <Link to="/" aria-label="Rubberstamp home" className="rounded-[3px]">
          <Wordmark />
        </Link>
        {repo ? (
          <Menu.Root>
            <Menu.Trigger className="flex min-w-0 items-center gap-1.5 rounded-[3px] px-2 py-1 font-mono text-sm text-ink hover:bg-sheet data-popup-open:bg-sheet">
              <span className="truncate">{repo}</span>
              <Chevron />
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner sideOffset={6} align="start">
                <Menu.Popup className="min-w-64 rounded-[3px] border border-rule bg-sheet p-1 shadow-[0_8px_24px_-12px_rgb(0_0_0/0.35)] outline-none">
                  <Menu.Group>
                    <Menu.GroupLabel className="px-3 pt-2 pb-1 text-xs text-muted">
                      Your repositories
                    </Menu.GroupLabel>
                    {repos.map((r) => {
                      const [owner = "", name = ""] = r.name.split("/");
                      return (
                        <Menu.Item
                          key={r.name}
                          render={
                            <Link
                              to="/$owner/$repo"
                              params={{ owner, repo: name }}
                            />
                          }
                          className="flex cursor-default items-center justify-between gap-4 rounded-[2px] px-3 py-1.5 font-mono text-sm outline-none data-highlighted:bg-violet data-highlighted:text-on-violet"
                        >
                          {r.name}
                          {r.name === repo ? (
                            <span className="font-sans text-xs">current</span>
                          ) : null}
                        </Menu.Item>
                      );
                    })}
                  </Menu.Group>
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
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
