import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { Home, HomeSkeleton } from "../components/home.tsx";
import { SignIn } from "../components/sign-in.tsx";
import { meQuery, reposQuery } from "../queries.ts";

export const Route = createFileRoute("/")({
  loader: ({ context }) =>
    context.me ? context.queryClient.ensureQueryData(reposQuery) : null,
  pendingComponent: HomeSkeleton,
  component: function Index() {
    const { data: me } = useSuspenseQuery(meQuery);
    return me ? <Repos /> : <SignIn />;
  },
});

function Repos() {
  const { data } = useSuspenseQuery(reposQuery);
  return <Home list={data} />;
}
