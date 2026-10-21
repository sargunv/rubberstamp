import { cx } from "../ui/cx.ts";

/** A captioned block of code, such as an example file. */
export function CodeSample({
  caption,
  className,
  children,
}: {
  caption: string;
  className?: string;
  children: string;
}) {
  return (
    <figure
      className={cx(
        "overflow-hidden rounded-sm border border-rule bg-sheet",
        className,
      )}
    >
      <figcaption className="border-b border-rule px-4 py-2 font-mono text-xs text-muted">
        {caption}
      </figcaption>
      <pre className="overflow-x-auto px-4 py-3 font-mono text-sm leading-relaxed">
        {children}
      </pre>
    </figure>
  );
}
