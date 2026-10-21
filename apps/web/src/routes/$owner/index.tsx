import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";

import {
  AccountNotFound,
  AccountPage,
  AccountSkeleton,
} from "../../components/account.tsx";
import { accountQuery } from "../../queries.ts";

export const Route = createFileRoute("/$owner/")({
  beforeLoad: ({ context }) => {
    if (!context.me) throw redirect({ to: "/" });
  },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(accountQuery(params.owner)),
  pendingComponent: function AccountPending() {
    return <AccountSkeleton owner={Route.useParams().owner} />;
  },
  component: function AccountRoute() {
    const { owner } = Route.useParams();
    const { data: account } = useSuspenseQuery(accountQuery(owner));
    return account ? (
      <AccountPage account={account} />
    ) : (
      <AccountNotFound owner={owner} />
    );
  },
});
