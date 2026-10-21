import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { Header } from "../components/header.tsx";

export const Route = createFileRoute("/privacy")({ component: Privacy });

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-3 space-y-3 [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_ul]:space-y-2">
        {children}
      </div>
    </section>
  );
}

function Privacy() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-2xl px-5 pt-10 pb-16 leading-relaxed sm:px-8">
        <h1 className="font-display text-5xl leading-none font-extrabold tracking-[0.01em]">
          Privacy policy
        </h1>
        <p className="mt-6 text-lg">
          Rubberstamp reads what it needs to label your issues and pull
          requests, keeps a short record of what it did, and has no ads or
          analytics.
        </p>
        <p className="mt-2 font-mono text-xs text-muted">
          Effective <time dateTime="2026-10-20">October 20, 2026</time>
        </p>

        <Section title="What Rubberstamp reads">
          <ul>
            <li>
              When an issue or pull request opens in a repository where
              Rubberstamp is installed and configured, it reads the item's title
              and description, a pull request's changed files and an excerpt of
              its changes, the repository's labels and their descriptions, and
              its{" "}
              <code className="font-mono text-sm">.config/rubberstamp.yml</code>
              .
            </li>
            <li>
              It sends those to TypeSafe's Jev model, which judges which labels
              fit. TypeSafe handles them under its own privacy policy.
            </li>
            <li>
              GitHub tells Rubberstamp about activity in every repository it's
              installed on. In repositories without a config, Rubberstamp reads
              nothing more and keeps nothing.
            </li>
          </ul>
        </Section>

        <Section title="What Rubberstamp keeps">
          <ul>
            <li>
              <b>A log of what it labeled:</b> for each item, the repository,
              number and title, the labels it added, their scores, the label
              groups they were judged with, and the model. Entries are deleted
              after 180 days, and when you uninstall Rubberstamp or remove the
              repository from it.
            </li>
            <li>
              <b>Previews you run in the dashboard:</b> the titles, labels and
              scores of the items previewed, and the config used. A preview is
              deleted after 60 days without anyone opening it. Uninstalling
              doesn't yet delete previews right away; it will soon.
            </li>
            <li>
              <b>How much each repository used</b> of its account's monthly
              allowance, and which accounts have Rubberstamp installed.
            </li>
            <li>
              Rubberstamp doesn't keep the contents of issues, pull requests or
              their changes after judging them.
            </li>
          </ul>
        </Section>

        <Section title="Signing in to the dashboard">
          <ul>
            <li>
              Signing in with GitHub gives Rubberstamp your username, avatar,
              and a token to ask GitHub which repositories you can see. It uses
              the token only for that, and to show the dashboard.
            </li>
            <li>
              These are kept in an encrypted cookie in your browser, not on
              Rubberstamp's servers. The cookie expires after eight hours, and
              signing out deletes it.
            </li>
            <li>
              Anyone who can write to a repository can see its log and previews
              in the dashboard.
            </li>
          </ul>
        </Section>

        <Section title="Where it runs">
          <p>
            Rubberstamp runs on Cloudflare, which stores its data and keeps its
            logs, which name repositories and item numbers, for up to a week.
            The dashboard loads avatars from GitHub. These providers handle
            request details under their own privacy policies.
          </p>
        </Section>

        <Section title="Changes">
          <p>
            If Rubberstamp starts handling data differently, this page and its
            date change before it does.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Send questions or requests about your privacy to{" "}
            <a
              href="mailto:rubberstamp@mail.sargunv.dev"
              className="rounded-[2px] text-violet underline underline-offset-4"
            >
              rubberstamp@mail.sargunv.dev
            </a>
            .
          </p>
        </Section>
      </main>
    </>
  );
}
