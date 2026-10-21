import { Combobox } from "@base-ui/react/combobox";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";

import { meQuery, reposQuery, useSignOut } from "../queries.ts";
import { Container } from "../ui/app-shell.tsx";
import { Button } from "../ui/button.tsx";
import { cx } from "../ui/cx.ts";
import { Chevron } from "../ui/icons.tsx";
import { Anchor, AppLink } from "../ui/link.tsx";
import { popupItemStyles, popupStyles } from "../ui/styles.ts";

export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cx(
        "inline-block rounded-sm border-2 border-violet px-1.5 pt-0.5 font-display text-lg leading-none font-extrabold tracking-[0.08em] text-violet uppercase outline-1 outline-offset-2 outline-violet",
        className,
      )}
    >
      Rubberstamp
    </span>
  );
}

/**
 * The site header, rendered once around every page. It reads the account and
 * repository from the URL, so pages never render or position it themselves.
 */
export function SiteHeader({ bare = false }: { bare?: boolean }) {
  const { owner, repo } = useParams({ strict: false });
  return (
    <header className="border-b border-rule">
      <Container className="flex items-center gap-5 py-3">
        <AppLink to="/" variant="plain" aria-label="Rubberstamp home">
          <Wordmark />
        </AppLink>
        {owner && !bare ? <Breadcrumb owner={owner} repo={repo} /> : null}
        {bare ? null : <Account />}
      </Container>
    </header>
  );
}

function Breadcrumb({
  owner,
  repo,
}: {
  owner: string;
  repo: string | undefined;
}) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="flex min-w-0 items-center font-mono text-sm"
    >
      {repo ? (
        <>
          <AppLink
            to="/$owner"
            params={{ owner }}
            variant="quiet"
            className="px-1 py-1"
          >
            {owner}
          </AppLink>
          <span aria-hidden className="text-muted">
            /
          </span>
          <RepoSwitcher repo={`${owner}/${repo}`} />
        </>
      ) : (
        <span aria-current="page" className="px-1 py-1">
          {owner}
        </span>
      )}
    </nav>
  );
}

function Account() {
  const me = useQuery(meQuery).data;
  const signOut = useSignOut();
  return (
    <div className="ml-auto flex items-center gap-3 text-sm">
      {me ? (
        <>
          <img
            src={me.avatarUrl}
            alt={me.login}
            title={me.login}
            className="size-7 rounded-full border border-rule"
          />
          <Button
            variant="subtle"
            disabled={signOut.isPending}
            onClick={() => signOut.mutate()}
          >
            Sign out
          </Button>
        </>
      ) : (
        <Anchor href="/auth/github" variant="quiet">
          Sign in
        </Anchor>
      )}
    </div>
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
        className="flex min-w-0 items-center gap-1.5 rounded-sm px-1.5 py-1 text-ink hover:bg-sheet data-popup-open:bg-sheet"
      >
        <span className="truncate">{repo.split("/")[1]}</span>
        <Chevron />
      </Combobox.Trigger>
      <Combobox.Portal>
        <Combobox.Positioner sideOffset={6} align="start">
          <Combobox.Popup
            aria-label="Switch repository"
            className={cx(
              "w-80 max-w-(--available-width) overflow-hidden",
              popupStyles,
            )}
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
                    className={cx(popupItemStyles, "font-mono text-sm")}
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
