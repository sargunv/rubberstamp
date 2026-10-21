import { Link } from "@tanstack/react-router";

/** The site's quiet footer: where the policy and the source live. */
export function Footer() {
  return (
    <footer className="mx-auto flex w-full max-w-6xl gap-5 px-5 py-6 text-xs text-muted sm:px-8">
      <Link
        to="/privacy"
        className="rounded-[2px] underline-offset-4 hover:text-ink hover:underline"
      >
        Privacy
      </Link>
      <a
        href="https://github.com/sargunv/rubberstamp"
        className="rounded-[2px] underline-offset-4 hover:text-ink hover:underline"
      >
        Source
      </a>
    </footer>
  );
}
