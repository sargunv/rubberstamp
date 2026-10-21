import type { ReactNode } from "react";

import { Wordmark } from "./header.tsx";

/** A placeholder bar, pulsing gently unless motion is reduced. */
function Bar({ className = "" }: { className?: string }) {
  return (
    <span
      className={`block animate-pulse rounded-full bg-rule motion-reduce:animate-none ${className}`}
    />
  );
}

function Busy({ children }: { children: ReactNode }) {
  return (
    <div aria-busy="true">
      <span className="sr-only">Loading</span>
      {children}
    </div>
  );
}

// Varied widths, so the rows read as a list of titles rather than a grid.
const TITLES = ["w-3/4", "w-1/2", "w-2/3", "w-5/6", "w-2/5", "w-3/5"];

/** The ruled ledger, empty while its rows load. */
export function LedgerSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <Busy>
      <div className="ledger relative border-t border-rule">
        {TITLES.slice(0, rows).map((width, i) => (
          <div
            key={i}
            className="grid grid-cols-[var(--mcol)_1fr] border-b border-rule lg:grid-cols-[var(--mcol)_1fr_22rem_5.5rem]"
          >
            <div className="flex justify-end py-5 pr-3">
              <Bar className="h-3 w-9" />
            </div>
            <div className="space-y-2 py-5 pl-5">
              <Bar className={`h-3.5 ${width}`} />
              <Bar className="h-2.5 w-24" />
            </div>
            <div className="col-start-2 flex gap-2 pb-5 pl-5 lg:col-start-auto lg:py-5 lg:pl-0">
              <Bar className="h-5 w-14" />
              <Bar className="h-5 w-20" />
            </div>
          </div>
        ))}
      </div>
    </Busy>
  );
}

/** The repository list, empty while it loads. */
export function ListSkeleton() {
  return (
    <Busy>
      <div className="border-t border-rule">
        {TITLES.map((width, i) => (
          <div key={i} className="border-b border-rule py-3.5">
            <Bar className={`h-3 ${width} max-w-72`} />
          </div>
        ))}
      </div>
    </Busy>
  );
}

/** The first load, before anything is known about the visitor. */
export function AppSkeleton() {
  return (
    <div
      aria-busy="true"
      className="grid min-h-dvh place-items-center opacity-50"
    >
      <span className="sr-only">Loading</span>
      <span className="animate-pulse motion-reduce:animate-none">
        <Wordmark />
      </span>
    </div>
  );
}
