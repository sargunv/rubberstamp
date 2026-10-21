import { ask, type Request } from "@sargunv/rubberstamp-core";
import * as v from "valibot";

import { parseAllowlist } from "./allowlist.ts";
import { Budgets } from "./budget.ts";
import { GitHubApp } from "./github/client.ts";
import { CloudflareStore } from "./store.ts";
import type { Policy } from "./webhooks.ts";

// One GitHub client per isolate, so its app and installation tokens outlive a
// single request. They are the app's, never a user's.
let github: { key: string; app: GitHubApp } | undefined;

function githubApp(env: Env): GitHubApp {
  const key = `${env.GITHUB_CLIENT_ID}\n${env.GITHUB_PRIVATE_KEY}`;
  if (github?.key !== key) {
    github = {
      key,
      app: new GitHubApp(env.GITHUB_CLIENT_ID, env.GITHUB_PRIVATE_KEY),
    };
  }
  return github.app;
}

/** The clients every entry point builds from its bindings. */
export function services(env: Env) {
  return {
    github: githubApp(env),
    store: new CloudflareStore(env.DB),
    budgets: v.parse(Budgets, env.BUDGETS),
    policy: {
      privateAllowlist: parseAllowlist(env.PRIVATE_ALLOWLIST),
    } satisfies Policy,
    jev: (request: Request) => ask(request, { apiKey: env.TYPESAFE_API_KEY }),
  };
}
