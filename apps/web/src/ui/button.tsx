import type { ComponentPropsWithRef } from "react";

import { cx } from "./cx.ts";
import { buttonStyles, type ButtonVariant } from "./styles.ts";

type ButtonProps = ComponentPropsWithRef<"button"> & {
  variant?: ButtonVariant;
};

export function Button({
  variant = "primary",
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={cx(buttonStyles[variant], className)}
    />
  );
}

/** A link that looks like a button, for actions that leave the page. */
export function ButtonLink({
  variant = "primary",
  className,
  ...props
}: ComponentPropsWithRef<"a"> & { variant?: ButtonVariant }) {
  return <a {...props} className={cx(buttonStyles[variant], className)} />;
}
