import type { ReactNode } from "react";

import { cx } from "./cx.ts";

/** A titled part of a page. */
export function Section({
  title,
  aside,
  className,
  children,
}: {
  title: ReactNode;
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cx("mt-14", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 className="text-sm font-semibold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Text that explains an empty or unavailable state. */
export function Notice({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <p className={cx("max-w-xl text-muted", className)}>{children}</p>;
}

/** Text that says what went wrong. */
export function ErrorText({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <p role="alert" className={cx("text-sm text-drop", className)}>
      {children}
    </p>
  );
}
