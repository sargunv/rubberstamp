import { createLink } from "@tanstack/react-router";
import type { ComponentPropsWithRef } from "react";

import { cx } from "./cx.ts";
import { linkStyles, type LinkVariant } from "./styles.ts";

type AnchorProps = ComponentPropsWithRef<"a"> & { variant?: LinkVariant };

/** A link off the site, styled by its role. */
export function Anchor({
  variant = "inline",
  className,
  ...props
}: AnchorProps) {
  return <a {...props} className={cx(linkStyles[variant], className)} />;
}

/** A link within the site, through the router, styled like `Anchor`. */
export const AppLink = createLink(Anchor);
