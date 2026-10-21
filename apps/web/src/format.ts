/** A fraction of the allowance as a percentage, never rounding a use to 0. */
export function percent(fraction: number): string {
  if (fraction <= 0) return "0%";
  if (fraction < 0.01) return "<1%";
  return `${Math.round(fraction * 100)}%`;
}
