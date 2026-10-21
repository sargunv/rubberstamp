import type { ComponentPropsWithRef } from "react";

import { cx } from "./cx.ts";

/** A single-line text field. Names and code inside it set in mono. */
export function TextInput({
  className,
  ...props
}: ComponentPropsWithRef<"input">) {
  return (
    <input
      {...props}
      className={cx(
        "rounded-sm border border-rule bg-sheet px-3 py-2 font-mono text-sm outline-none placeholder:font-sans placeholder:text-muted focus:border-violet",
        className,
      )}
    />
  );
}
