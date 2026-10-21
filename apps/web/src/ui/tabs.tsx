import { createLink } from "@tanstack/react-router";
import type { ComponentPropsWithRef, ReactNode } from "react";

import { cx } from "./cx.ts";

/** A row of tabs, each a link to its own page. */
export function TabList({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <nav
      aria-label={label}
      className="mt-6 mb-8 flex gap-6 border-b border-rule text-sm"
    >
      {children}
    </nav>
  );
}

function TabAnchor({ className, ...props }: ComponentPropsWithRef<"a">) {
  return (
    <a
      {...props}
      className={cx(
        "-mb-px border-b-2 border-transparent pb-2 text-muted hover:text-ink data-[status=active]:border-violet data-[status=active]:text-ink",
        className,
      )}
    />
  );
}

/** A tab that the router marks active when its page is open. */
export const TabLink = createLink(TabAnchor);
