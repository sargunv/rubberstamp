import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";

import { Footer } from "../components/footer.tsx";
import { AppPending } from "../components/pending.tsx";
import { meQuery } from "../queries.ts";

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  beforeLoad: async ({ context }) => ({
    me: await context.queryClient.ensureQueryData(meQuery),
  }),
  component: function Root() {
    return (
      <div className="flex min-h-dvh flex-col">
        <div className="flex flex-1 flex-col">
          <Outlet />
        </div>
        <Footer />
      </div>
    );
  },
  pendingComponent: AppPending,
  errorComponent: function Failed({ error, reset }) {
    return (
      <main className="mx-auto max-w-xl px-5 pt-24">
        <h1 className="font-display text-4xl font-extrabold">
          Something broke
        </h1>
        <p className="mt-4 font-mono text-sm text-(--drop)">
          {error instanceof Error ? error.message : String(error)}
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 rounded-[3px] bg-violet px-4 py-2 font-semibold text-on-violet"
        >
          Try again
        </button>
      </main>
    );
  },
});
