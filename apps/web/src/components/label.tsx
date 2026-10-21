import type { LabelChange } from "../preview.ts";

/** Black or white text, whichever reads better on the label's color. */
function textOn(hex: string): string {
  const [r = 0, g = 0, b = 0] = [0, 2, 4].map(
    (i) => parseInt(hex.slice(i, i + 2), 16) / 255,
  );
  return 0.299 * r + 0.587 * g + 0.114 * b > 0.6 ? "#1f2328" : "#ffffff";
}

/** A label as GitHub draws it. */
export function Label({ name, color }: { name: string; color: string }) {
  return (
    <span
      className="label"
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
}: {
  change: LabelChange;
  color: string;
}) {
  return (
    <span
      className="label-change"
      data-change={change.change}
      title={
        change.rule === "filled to min"
          ? `${TITLE.added}, to meet the group's minimum`
          : TITLE[change.change]
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
          ? " (would add)"
          : change.change === "dropped"
            ? " (wouldn't add)"
            : ""}
      </span>
    </span>
  );
}
