import { createFileRoute } from "@tanstack/react-router";

import { Anchor } from "../ui/link.tsx";
import { MetaLine, Page } from "../ui/page.tsx";
import { Lede, Prose } from "../ui/prose.tsx";

export const Route = createFileRoute("/privacy")({ component: Privacy });

function Privacy() {
  return (
    <Page title="Privacy policy" width="prose">
      <Lede>
        Rubberstamp reads what it needs to label your issues and pull requests
        and choose which CI they need, keeps a short record of what it did, and
        has no ads or analytics.
      </Lede>
      <MetaLine className="mt-2">
        <span>
          Effective <time dateTime="2026-10-21">October 21, 2026</time>
        </span>
      </MetaLine>
      <Prose>
        <h2>What Rubberstamp reads</h2>
        <ul>
          <li>
            When an issue or pull request opens in a repository where
            Rubberstamp is installed and configured, it reads the item's title
            and description, a pull request's changed files and an excerpt of
            its changes, the repository's labels and their descriptions, and its{" "}
            <code>.config/rubberstamp.yml</code>.
          </li>
          <li>
            When its config names CI units, it also reads a pull request's
            title, description, changed files and changes each time it opens,
            reopens, gets new commits, or changes its base branch.
          </li>
          <li>
            It sends those to TypeSafe's Jev model, which judges which labels
            fit and which CI units the changes need. TypeSafe handles them under
            its own privacy policy.
          </li>
          <li>
            GitHub tells Rubberstamp about activity in every repository it's
            installed on. In repositories without a config, Rubberstamp reads
            nothing more and keeps nothing.
          </li>
        </ul>

        <h2>What Rubberstamp keeps</h2>
        <ul>
          <li>
            <b>A log of what it labeled:</b> for each item, the repository,
            number and title, the labels it added, their scores, the label
            groups they were judged with, and the model. Entries are deleted
            after 180 days, and when you uninstall Rubberstamp or remove the
            repository from it.
          </li>
          <li>
            <b>A log of the CI it planned:</b> for each pull request commit and
            base branch, the repository, number and title, the commit, which CI
            units it planned, their scores or the rule that decided them, and
            the model. Plans are deleted on the same schedule as the label log.
          </li>
          <li>
            <b>Previews you run in the dashboard:</b> the titles, labels and
            scores of the items previewed, and the config used. A preview is
            deleted after 60 days without anyone opening it. Uninstalling
            doesn't yet delete previews right away; it will soon.
          </li>
          <li>
            <b>How much each repository used</b> of its account's monthly
            allowance, for labels and for CI, and which accounts have
            Rubberstamp installed.
          </li>
          <li>
            Rubberstamp doesn't keep the contents of issues, pull requests or
            their changes after judging them.
          </li>
        </ul>

        <h2>Signing in to the dashboard</h2>
        <ul>
          <li>
            Signing in with GitHub gives Rubberstamp your username, avatar, and
            a token to ask GitHub which repositories you can see. It uses the
            token only for that, and to show the dashboard.
          </li>
          <li>
            These are kept in an encrypted cookie in your browser, not on
            Rubberstamp's servers. The cookie expires after eight hours, and
            signing out deletes it.
          </li>
          <li>
            Anyone who can write to a repository can see its activity and
            previews in the dashboard.
          </li>
        </ul>

        <h2>CI plans for workflows</h2>
        <ul>
          <li>
            Workflows ask Rubberstamp for a pull request's CI plan so they can
            skip what it doesn't need. Asking can make Rubberstamp plan a pull
            request it hasn't yet, just as a push would.
          </li>
          <li>
            For a public repository, anyone can ask for a pull request's plan:
            its unit names, which run or skip, their scores, and the rules that
            decided them.
          </li>
          <li>
            For a private repository, asking takes a token that can read the
            repository, such as the workflow's own. Rubberstamp checks the token
            with GitHub and doesn't keep it.
          </li>
        </ul>

        <h2>Where it runs</h2>
        <p>
          Rubberstamp runs on Cloudflare, which stores its data and keeps its
          logs, which name repositories and item numbers, for up to a week. The
          dashboard loads avatars from GitHub. These providers handle request
          details under their own privacy policies.
        </p>

        <h2>Changes</h2>
        <p>
          If Rubberstamp starts handling data differently, this page and its
          date change before it does.
        </p>

        <h2>Contact</h2>
        <p>
          Send questions or requests about your privacy to{" "}
          <Anchor href="mailto:rubberstamp@mail.sargunv.dev">
            rubberstamp@mail.sargunv.dev
          </Anchor>
          .
        </p>
      </Prose>
    </Page>
  );
}
