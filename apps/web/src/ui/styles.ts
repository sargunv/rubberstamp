/**
 * The design system's shared class recipes. Components use these; pages use
 * components, so a page never restates how a link or button looks.
 */

export const linkStyles = {
  /** Within running text: always underlined. */
  inline: "rounded-xs text-ink underline underline-offset-4",
  /** Secondary navigation: muted until hovered. */
  quiet:
    "rounded-xs text-muted underline-offset-4 hover:text-ink hover:underline",
  /** A link that reads as the thing it names, such as a title or a name. */
  plain: "rounded-xs hover:underline",
  /** Names of repositories and accounts in lists. */
  name: "rounded-xs font-mono hover:text-violet",
} as const;

export type LinkVariant = keyof typeof linkStyles;

export const buttonStyles = {
  primary:
    "inline-flex items-center gap-2.5 rounded-sm bg-violet px-4 py-2.5 font-semibold text-on-violet hover:bg-[color-mix(in_oklch,var(--violet),var(--ink)_18%)] disabled:opacity-60",
  /** A text-only action, such as "Preview again" or "Show all". */
  quiet:
    "rounded-xs text-ink underline-offset-4 hover:underline disabled:text-muted disabled:no-underline",
  /** A text-only action in the site's chrome, muted like a quiet link. */
  subtle:
    "rounded-xs text-muted underline-offset-4 hover:text-ink hover:underline disabled:opacity-60",
} as const;

export type ButtonVariant = keyof typeof buttonStyles;

/** Floating surfaces: menus, comboboxes, and tooltips. */
export const popupStyles =
  "rounded-sm border border-rule bg-sheet shadow-popup outline-none";

/** A selectable row in a popup. */
export const popupItemStyles =
  "flex cursor-default items-center justify-between gap-4 rounded-xs px-2.5 py-1.5 outline-none data-highlighted:bg-violet data-highlighted:text-on-violet";
