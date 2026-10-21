import { createFileRoute, redirect } from "@tanstack/react-router";

// Accounts live under /github/<owner>; the prefix alone has nothing to show.
export const Route = createFileRoute("/github/")({
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
});
