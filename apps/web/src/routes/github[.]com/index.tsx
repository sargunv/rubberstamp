import { createFileRoute, redirect } from "@tanstack/react-router";

// Accounts live under /github.com/<owner>; the host alone has nothing to show.
export const Route = createFileRoute("/github.com/")({
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
});
