import { Collapsible } from "@base-ui/react/collapsible";
import { LockIcon } from "@primer/octicons-react";
import type { Account } from "@sargunv/rubberstamp-core";
import { useState, type CSSProperties, type ReactNode } from "react";

import { percent } from "../format.ts";
import { cx } from "../ui/cx.ts";
import { DisclosurePanel, DisclosureTrigger } from "../ui/disclosure.tsx";
import { Anchor, AppLink } from "../ui/link.tsx";
import { MetaLine, Page } from "../ui/page.tsx";
import { PendingBar } from "../ui/progress.tsx";
import { Notice, Section } from "../ui/section.tsx";
import { GitHubLink } from "./github-link.tsx";
import { ItemKindIcon } from "./item-state.tsx";
import { LabelDiff } from "./label.tsx";
import { Ledger, LedgerRow } from "./ledger.tsx";
import { RepoGrid } from "./repo-grid.tsx";

type Repo = Account["repos"][number];

const monthName = new Intl.DateTimeFormat("en", {
  month: "long",
  timeZone: "UTC",
});
const day = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const times = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });
const when = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** The UTC month an allowance period covers, and how far through it now is. */
function month(period: string, now = Date.now()) {
  const [year = 1970, index = 1] = period.split("-").map(Number);
  const start = Date.UTC(year, index - 1, 1);
  const end = Date.UTC(year, index, 1);
  const elapsed = Math.min(1, Math.max(0, (now - start) / (end - start)));
  return { start, end, elapsed };
}

/** Each busy repository's ink: the account's violet, lighter as shares shrink. */
function ink(rank: number): string {
  const strength = Math.max(28, 100 - rank * 18);
  return `color-mix(in oklch, var(--violet) ${strength}%, var(--paper))`;
}

/**
 * An account's title around its content. The page and its loading state both
 * render this, so neither can lay out differently.
 */
function AccountFrame({
  owner,
  meta,
  children,
}: {
  owner: string;
  meta?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Page
      title={owner}
      aside={
        <GitHubLink
          href={`https://github.com/${owner}`}
          label={`${owner} on GitHub`}
        />
      }
      meta={meta}
    >
      {children}
    </Page>
  );
}

export function AccountPending({ owner }: { owner: string }) {
  return (
    <AccountFrame owner={owner}>
      <PendingBar />
    </AccountFrame>
  );
}

export function AccountNotFound({ owner }: { owner: string }) {
  return (
    <AccountFrame owner={owner}>
      <Notice className="mt-8">
        Rubberstamp isn't installed on this account, or you can't see its
        installation.
      </Notice>
    </AccountFrame>
  );
}

/** An account's installation: its month's allowance, repositories, and work. */
export function AccountPage({ account }: { account: Account }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const busy = account.repos.filter((r) => r.share > 0 || r.labeled > 0);
  const idle = account.repos.filter((r) => r.share === 0 && r.labeled === 0);
  const colors = new Map(
    busy.filter((r) => r.share > 0).map((r, i) => [r.name, ink(i)]),
  );
  return (
    <AccountFrame
      owner={account.login}
      meta={
        <>
          <span>
            {account.type === "Organization"
              ? "Organization"
              : "Personal account"}{" "}
            · {account.repos.length}{" "}
            {account.repos.length === 1 ? "repository" : "repositories"}
          </span>
          <Anchor
            href={account.manageUrl}
            variant="quiet"
            className="font-sans"
          >
            Manage on GitHub
          </Anchor>
        </>
      }
    >
      <Allowance
        account={account}
        busy={busy}
        colors={colors}
        hovered={hovered}
        onHover={setHovered}
      />

      <Section title="Repositories">
        {busy.length > 0 ? (
          <RepoTable
            repos={busy}
            colors={colors}
            hovered={hovered}
            onHover={setHovered}
          />
        ) : (
          <Notice className="mt-3 text-sm">
            Nothing labeled or previewed this month.
          </Notice>
        )}
        {idle.length > 0 ? (
          <IdleRepos owner={account.login} repos={idle} />
        ) : null}
      </Section>

      <Section title="Recent activity">
        {account.activity.length === 0 ? (
          <Notice className="mt-3 text-sm">No items labeled yet.</Notice>
        ) : (
          <Ledger>
            {account.activity.map((entry) => {
              const [owner = "", name = ""] = entry.repo.split("/");
              return (
                <LedgerRow
                  key={`${entry.repo}#${entry.number}-${entry.createdAt}`}
                  number={entry.number}
                  url={`https://github.com/${entry.repo}/issues/${entry.number}`}
                  icon={<ItemKindIcon type={entry.type} />}
                  title={entry.title}
                  meta={
                    <>
                      <AppLink
                        to="/github.com/$owner/$repo"
                        params={{ owner, repo: name }}
                        variant="name"
                        className="text-ink"
                      >
                        {name}
                      </AppLink>{" "}
                      · Labeled {when.format(new Date(entry.createdAt))}
                    </>
                  }
                  chips={
                    entry.added.length === 0 ? (
                      <Notice className="text-sm">No labels added</Notice>
                    ) : (
                      entry.added.map((label) => (
                        <LabelDiff
                          key={label}
                          change={{ name: label, change: "added" }}
                          done
                          color="ededed"
                        />
                      ))
                    )
                  }
                />
              );
            })}
          </Ledger>
        )}
      </Section>
    </AccountFrame>
  );
}

/**
 * The month's allowance as one strip: each repository's share in its own ink,
 * the rest left blank, and a tick for how far through the month it is.
 */
function Allowance({
  account,
  busy,
  colors,
  hovered,
  onHover,
}: {
  account: Account;
  busy: Repo[];
  colors: Map<string, string>;
  hovered: string | null;
  onHover: (repo: string | null) => void;
}) {
  const { used, multiplier, ceilingReached } = account.allowance;
  const { start, end, elapsed } = month(account.period);
  const spent = used >= 1;
  // Past the allowance, shares shrink to fit and the overflow shows in red.
  const scale = Math.max(1, used);
  const pace = used > 0 && elapsed > 0.05 ? used / elapsed : null;
  const runsOut =
    pace !== null && pace > 1 && !spent
      ? start + (end - start) * (elapsed / used)
      : null;

  return (
    <section aria-label="Allowance" className="mt-12">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 className="text-lg">
          <span className="font-display text-3xl font-extrabold tracking-[0.01em]">
            {percent(used)}
          </span>{" "}
          of {monthName.format(start)}'s allowance used
          {multiplier !== 1 ? (
            <span className="ml-2 font-mono text-xs text-muted">
              {times.format(multiplier)}× the default
            </span>
          ) : null}
        </h2>
        <MetaLine>Resets {day.format(end)}</MetaLine>
      </div>

      <div className="relative mt-4 pb-5">
        <div
          role="img"
          aria-label={`${percent(used)} of the monthly allowance used, ${percent(elapsed)} of the way through the month`}
          className={cx(
            "flex h-8 overflow-hidden rounded-sm border bg-sheet",
            spent ? "border-drop" : "border-rule",
          )}
        >
          {busy
            .filter((r) => r.share > 0)
            .map((repo) => (
              <span
                key={repo.name}
                onMouseEnter={() => onHover(repo.name)}
                onMouseLeave={() => onHover(null)}
                className="h-full border-r border-paper transition-opacity last:border-r-0"
                style={{
                  width: `${(repo.share / scale) * 100}%`,
                  background: spent ? "var(--drop)" : colors.get(repo.name),
                  opacity: hovered && hovered !== repo.name ? 0.35 : 1,
                }}
              />
            ))}
          {account.unattributed > 0 ? (
            <span
              title="Before usage was counted per repository"
              className="unattributed h-full"
              style={{ width: `${(account.unattributed / scale) * 100}%` }}
            />
          ) : null}
        </div>
        <span
          aria-hidden
          className="absolute -top-1.5 bottom-3 w-px bg-ink"
          style={{ left: `${elapsed * 100}%` }}
        />
        <span
          aria-hidden
          className="absolute bottom-0 -translate-x-1/2 font-mono text-xs text-muted"
          style={{ left: `${elapsed * 100}%` }}
        >
          today
        </span>
      </div>

      <p className="mt-2 text-sm text-muted">
        {ceilingReached ? (
          <span className="text-drop">
            Rubberstamp's shared monthly limit is spent, so labeling is paused
            for every account until {day.format(end)}.
          </span>
        ) : spent ? (
          <span className="text-drop">
            The allowance is spent. Labeling and previews are paused until{" "}
            {day.format(end)}.
          </span>
        ) : runsOut !== null ? (
          <>At this pace, it runs out around {day.format(runsOut)}.</>
        ) : pace !== null ? (
          <>At this pace, about {percent(pace)} by the end of the month.</>
        ) : (
          <>Labeling and previews both spend from it.</>
        )}
      </p>
    </section>
  );
}

function RepoTable({
  repos,
  colors,
  hovered,
  onHover,
}: {
  repos: Repo[];
  colors: Map<string, string>;
  hovered: string | null;
  onHover: (repo: string | null) => void;
}) {
  return (
    <table className="mt-3 w-full table-fixed border-t border-rule text-sm">
      <thead className="text-left text-xs text-muted">
        <tr className="border-b border-rule">
          <th className="py-2 pr-3 pl-3 font-normal">Repository</th>
          <th className="w-24 px-3 py-2 text-right font-normal">Share</th>
          <th className="hidden w-28 px-3 py-2 text-right font-normal sm:table-cell">
            Labeled
          </th>
          <th className="hidden w-36 px-3 py-2 text-right font-normal sm:table-cell">
            Last labeled
          </th>
        </tr>
      </thead>
      <tbody>
        {repos.map((repo) => {
          const [owner = "", name = ""] = repo.name.split("/");
          const swatch: CSSProperties = {
            background: colors.get(repo.name) ?? "transparent",
          };
          return (
            <tr
              key={repo.name}
              onMouseEnter={() => onHover(repo.name)}
              onMouseLeave={() => onHover(null)}
              className={cx(
                "border-b border-rule",
                hovered === repo.name && "bg-sheet",
              )}
            >
              <td className="px-3 py-2.5">
                <AppLink
                  to="/github.com/$owner/$repo"
                  params={{ owner, repo: name }}
                  onFocus={() => onHover(repo.name)}
                  onBlur={() => onHover(null)}
                  variant="name"
                  className="flex items-center gap-2.5"
                >
                  {/* Each repository's ink on the strip; none when it spent nothing. */}
                  <span
                    aria-hidden
                    className="size-2.5 shrink-0 rounded-xs"
                    style={swatch}
                  />
                  {name}
                  {repo.private ? (
                    <LockIcon
                      size={12}
                      aria-label="Private"
                      className="fill-muted"
                    />
                  ) : null}
                </AppLink>
              </td>
              <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                {repo.share > 0 ? percent(repo.share) : "—"}
              </td>
              <td className="hidden px-3 py-2.5 text-right font-mono tabular-nums sm:table-cell">
                {repo.labeled}
              </td>
              <td className="hidden px-3 py-2.5 text-right text-muted sm:table-cell">
                {repo.lastLabeledAt
                  ? day.format(new Date(repo.lastLabeledAt))
                  : "—"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Repositories with nothing this month, folded away so large accounts stay short. */
function IdleRepos({ owner, repos }: { owner: string; repos: Repo[] }) {
  return (
    <Collapsible.Root className="mt-4">
      <DisclosureTrigger>
        {repos.length} {repos.length === 1 ? "repository" : "repositories"} with
        nothing this month
      </DisclosureTrigger>
      <DisclosurePanel>
        <div className="mt-3">
          <RepoGrid owner={owner} repos={repos} />
        </div>
      </DisclosurePanel>
    </Collapsible.Root>
  );
}
