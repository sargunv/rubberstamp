import type { ReactNode } from "react";

/**
 * Every screen's frame: the header, the content, and the footer. The root
 * route renders it once for loaded pages and once for the first load, so the
 * header never moves between them.
 */
export function AppShell({
  header,
  footer,
  children,
}: {
  header: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      {header}
      <div className="flex flex-1 flex-col">{children}</div>
      {footer}
    </div>
  );
}

/** The width and gutters every row of the site lines up to. */
export function Container({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`mx-auto w-full max-w-6xl px-5 sm:px-8 ${className ?? ""}`}>
      {children}
    </div>
  );
}
