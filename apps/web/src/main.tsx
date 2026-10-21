import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { ApiError } from "./api.ts";
import { meQuery } from "./queries.ts";
import { routeTree } from "./routeTree.gen.ts";

import "./styles.css";

/** A request found the session expired: forget the user and go to sign-in. */
function onError(error: unknown) {
  if (!(error instanceof ApiError) || error.status !== 401) return;
  queryClient.clear();
  queryClient.setQueryData(meQuery.queryKey, null);
  void router.navigate({ to: "/" });
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError }),
  mutationCache: new MutationCache({ onError }),
  defaultOptions: {
    // Cached data shows at once; anything older than this refreshes behind it.
    queries: { staleTime: 30_000 },
  },
});

const router = createRouter({
  routeTree,
  context: { queryClient },
  // Hovering a link loads its data. Query decides what's fresh.
  defaultPreload: "intent",
  defaultPreloadStaleTime: 0,
  defaultPendingMs: 150,
  defaultPendingComponent: () => (
    <p className="px-5 pt-10 text-sm text-muted sm:px-8">Loading…</p>
  ),
  scrollRestoration: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>,
  );
}
