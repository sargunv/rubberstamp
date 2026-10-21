import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { PendingBar } from "../../../components/pending.tsx";
import { RepoLayout, RepoShell } from "../../../components/repo-layout.tsx";
import { repoQuery } from "../../../queries.ts";
import { repoName } from "./-shared.ts";

export const Route = createFileRoute("/$owner/$repo")({
  beforeLoad: ({ context }) => {
    if (!context.me) throw redirect({ to: "/" });
  },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(repoQuery(repoName(params))),
  component: function Repo() {
    const name = repoName(Route.useParams());
    const { data: status } = useSuspenseQuery(repoQuery(name));
    return (
      <RepoLayout key={name} repo={name} status={status}>
        <Outlet />
      </RepoLayout>
    );
  },
  pendingComponent: function RepoPending() {
    return (
      <RepoShell repo={repoName(Route.useParams())} tabs>
        <PendingBar />
      </RepoShell>
    );
  },
});
