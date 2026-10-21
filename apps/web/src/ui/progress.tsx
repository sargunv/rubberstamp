/**
 * A thin line across the top of the window while a page loads. Pages show
 * what they already know around it, and nothing they'd have to guess.
 */
export function PendingBar() {
  return (
    <div
      role="progressbar"
      aria-label="Loading"
      className="fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden"
    >
      <div className="pending-bar h-full w-1/3 bg-violet" />
    </div>
  );
}

/** A thin bar filled by how much of a known amount of work is done. */
export function ProgressBar({ done, total }: { done: number; total: number }) {
  const fraction = total > 0 ? done / total : 0;
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      className="h-0.5 w-full overflow-hidden rounded-full bg-rule"
    >
      <div
        className="h-full bg-violet transition-[width] duration-300 motion-reduce:transition-none"
        style={{ width: `${fraction * 100}%` }}
      />
    </div>
  );
}
