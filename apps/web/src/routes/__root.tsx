import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";

import { SiteFooter } from "../components/footer.tsx";
import { SiteHeader } from "../components/header.tsx";
import { meQuery } from "../queries.ts";
import { AppShell } from "../ui/app-shell.tsx";
import { Button } from "../ui/button.tsx";
import { Page } from "../ui/page.tsx";
import { PendingBar } from "../ui/progress.tsx";
import { ErrorText } from "../ui/section.tsx";

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  beforeLoad: async ({ context }) => ({
    me: await context.queryClient.ensureQueryData(meQuery),
  }),
  component: function Root() {
    return (
      <AppShell header={<SiteHeader />} footer={<SiteFooter />}>
        <Outlet />
      </AppShell>
    );
  },
  // Before anything is known about the visitor: the same shell, so nothing
  // moves when the page arrives.
  pendingComponent: function RootPending() {
    return (
      <AppShell header={<SiteHeader bare />}>
        <PendingBar />
      </AppShell>
    );
  },
  errorComponent: function Failed({ error, reset }) {
    return (
      <AppShell header={<SiteHeader bare />} footer={<SiteFooter />}>
        <Page title="Something broke">
          <ErrorText className="mt-4 font-mono">
            {error instanceof Error ? error.message : String(error)}
          </ErrorText>
          <Button className="mt-6" onClick={reset}>
            Try again
          </Button>
        </Page>
      </AppShell>
    );
  },
});
