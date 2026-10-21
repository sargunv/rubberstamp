import { Tooltip } from "@base-ui/react/tooltip";

import type { LabelChange } from "../preview.ts";
import { cx } from "../ui/cx.ts";
import { popupStyles } from "../ui/styles.ts";

/** Black or white text, whichever reads better on the label's color. */
function textOn(hex: string): string {
  const [r = 0, g = 0, b = 0] = [0, 2, 4].map(
    (i) => parseInt(hex.slice(i, i + 2), 16) / 255,
  );
  return 0.299 * r + 0.587 * g + 0.114 * b > 0.6 ? "#1f2328" : "#ffffff";
}

/** A label as GitHub draws it. */
export function Label({
  name,
  color,
  className = "",
}: {
  name: string;
  color: string;
  className?: string;
}) {
  return (
    <span
      className={`label ${className}`}
      style={{ "--label": `#${color}`, "--label-text": textOn(color) }}
    >
      {name}
    </span>
  );
}

const MARK = { added: "+", dropped: "−" } as const;
const TITLE = {
  kept: "On GitHub, and Rubberstamp picks it too",
  added: "Rubberstamp would add this",
  dropped: "On GitHub, but Rubberstamp wouldn't add it",
  outside: "Not in any label group, so Rubberstamp leaves it alone",
} as const;

/** A label in the diff between GitHub and Rubberstamp's picks. */
export function LabelDiff({
  change,
  color,
  done = false,
}: {
  change: LabelChange;
  color: string;
  /** Whether Rubberstamp already added it, as in a log, rather than would. */
  done?: boolean;
}) {
  const title =
    done && change.change === "added"
      ? "Rubberstamp added this"
      : TITLE[change.change];
  return (
    <span
      className="label-change"
      data-change={change.change}
      title={
        change.rule === "filled to min"
          ? `${title}, to meet the group's minimum`
          : title
      }
    >
      {change.change === "added" || change.change === "dropped" ? (
        <span aria-hidden className="label-mark">
          {MARK[change.change]}
        </span>
      ) : null}
      <Label name={change.name} color={color} />
      <span className="sr-only">
        {change.change === "added"
          ? done
            ? " (added)"
            : " (would add)"
          : change.change === "dropped"
            ? " (wouldn't add)"
            : ""}
      </span>
    </span>
  );
}

/** A label that shows the description Jev reads when hovered or focused. */
export function DescribedLabel({
  name,
  color,
  meaning,
  fromConfig,
  className = "",
}: {
  name: string;
  color: string;
  meaning: string;
  /** Where the description comes from, when that's known. */
  fromConfig?: boolean;
  className?: string;
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        render={<span tabIndex={0} />}
        className={`inline-flex max-w-full rounded-full ${className}`}
      >
        <Label name={name} color={color} className="max-w-full truncate" />
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner sideOffset={6}>
          <Tooltip.Popup
            className={cx(
              popupStyles,
              "max-w-sm px-3 py-2 text-sm transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0",
            )}
          >
            {meaning}
            {fromConfig === undefined ? null : (
              <span className="mt-1 block text-xs text-muted">
                {fromConfig ? "From describe in the config" : "From GitHub"}
              </span>
            )}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
