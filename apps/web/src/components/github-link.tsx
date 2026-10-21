import { MarkGithubIcon } from "@primer/octicons-react";

/** A quiet link out to the same thing on GitHub, beside a page's title. */
export function GitHubLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      aria-label={label}
      title={label}
      className="inline-flex shrink-0 rounded-[3px] p-1 text-muted hover:text-ink"
    >
      <MarkGithubIcon size={24} className="fill-current" />
    </a>
  );
}
