import type { ReactNode } from "react";

import { cx } from "./cx.ts";

/**
 * A page's content: its title row, an optional meta line, and its body. Pages
 * and their loading states both render it, so their titles line up exactly.
 */
export function Page({
  title,
  aside,
  meta,
  width = "wide",
  children,
}: {
  title: ReactNode;
  /** Beside the title, such as a link to GitHub. */
  aside?: ReactNode;
  meta?: ReactNode;
  /** "prose" narrows the page for reading. */
  width?: "wide" | "prose";
  children?: ReactNode;
}) {
  return (
    <main
      className={cx(
        "mx-auto w-full px-5 pt-10 pb-24 sm:px-8",
        width === "wide" ? "max-w-6xl" : "max-w-2xl",
      )}
    >
      <div className="flex items-center gap-4">
        <h1 className="font-display text-5xl leading-none font-extrabold tracking-[0.01em] sm:text-6xl">
          {title}
        </h1>
        {aside}
      </div>
      {meta ? <MetaLine className="mt-3">{meta}</MetaLine> : null}
      {children}
    </main>
  );
}

/** Facts about what's on the page, in small type. */
export function MetaLine({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <p
      className={cx(
        "flex flex-wrap items-baseline gap-x-3 gap-y-1 font-mono text-xs text-muted",
        className,
      )}
    >
      {children}
    </p>
  );
}
