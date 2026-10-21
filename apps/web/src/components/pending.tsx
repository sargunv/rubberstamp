import { Header } from "./header.tsx";

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

/**
 * The first load, before anything is known about the visitor: the header's
 * wordmark where every page has it, so nothing moves when the page arrives.
 */
export function AppPending() {
  return (
    <>
      <PendingBar />
      <Header bare />
    </>
  );
}
