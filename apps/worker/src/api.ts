import {
  parseConfig,
  previewGroups,
  resolveLabels,
  type Log,
  type Me,
  type PreviewState,
  type RepoList,
  type RepoStatus,
} from "@sargunv/rubberstamp-core";
import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";

import { allowlisted } from "./allowlist.ts";
import { authorizeUrl, exchangeCode } from "./auth/oauth.ts";
import {
  openSession,
  sealSession,
  sessionKey,
  type Session,
} from "./auth/session.ts";
import { budgetFor, budgetPeriod } from "./budget.ts";
import { services } from "./services.ts";

type Env_ = { Bindings: Env; Variables: { session: Session } };

const SESSION = "rs_session";
const STATE = "rs_oauth_state";

const cookieOptions = (env: Env) => ({
  httpOnly: true,
  // Local development runs on plain http, where some browsers drop Secure.
  secure: env.APP_ORIGIN.startsWith("https:"),
  sameSite: "Lax" as const,
  path: "/",
});

function installUrl(env: Env): string {
  return `https://github.com/apps/${env.APP_SLUG}/installations/new`;
}

export const auth = new Hono<Env_>();

auth.get("/github", (c) => {
  const state = crypto.randomUUID();
  setCookie(c, STATE, state, { ...cookieOptions(c.env), maxAge: 600 });
  return c.redirect(
    authorizeUrl(
      c.env.GITHUB_CLIENT_ID,
      `${c.env.APP_ORIGIN}/auth/github/callback`,
      state,
    ),
  );
});

auth.get("/github/callback", async (c) => {
  const { code, state } = c.req.query();
  const expected = getCookie(c, STATE);
  deleteCookie(c, STATE, { path: "/" });
  if (!code || !state || state !== expected) {
    return c.text("Sign-in expired or was tampered with. Try again.", 400);
  }
  const { github } = services(c.env);
  const { token, expiresIn } = await exchangeCode({
    clientId: c.env.GITHUB_CLIENT_ID,
    clientSecret: c.env.GITHUB_CLIENT_SECRET,
    code,
    redirectUri: `${c.env.APP_ORIGIN}/auth/github/callback`,
  });
  const me = await github.user(token).me();
  const session: Session = {
    ...me,
    token,
    expires: Date.now() + expiresIn * 1000,
  };
  const key = await sessionKey(c.env.SESSION_SECRET);
  setCookie(c, SESSION, await sealSession(key, session), {
    ...cookieOptions(c.env),
    maxAge: expiresIn,
  });
  return c.redirect("/");
});

auth.post("/sign-out", (c) => {
  deleteCookie(c, SESSION, { path: "/" });
  return c.body(null, 204);
});

export const api = new Hono<Env_>();

api.use(async (c, next) => {
  // Cookies are SameSite=Lax; checking Origin closes the remaining CSRF gap.
  if (c.req.method !== "GET" && c.req.header("Origin") !== c.env.APP_ORIGIN) {
    return c.json({ error: "Cross-origin request" }, 403);
  }
  const key = await sessionKey(c.env.SESSION_SECRET);
  const session = await openSession(key, getCookie(c, SESSION));
  if (!session) return c.json({ error: "Signed out" }, 401);
  c.set("session", session);
  await next();
});

api.get("/me", (c) => {
  const { login, avatarUrl } = c.get("session");
  return c.json({ login, avatarUrl } satisfies Me);
});

api.get("/repos", async (c) => {
  const { github, policy } = services(c.env);
  const repos = await github.user(c.get("session").token).repos();
  const list: RepoList = {
    repos: repos
      .filter((r) => r.permissions?.push || r.permissions?.admin)
      .filter(
        (r) => !r.private || allowlisted(policy.privateAllowlist, r.full_name),
      )
      .map((r) => ({ name: r.full_name, private: r.private }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    installUrl: installUrl(c.env),
  };
  return c.json(list);
});

type Access =
  | { ok: false; status: RepoStatus }
  | { ok: false; notFound: true }
  | {
      ok: true;
      repo: string;
      installation: { id: number; account: string };
    };

/** Whether the user may tune a repository, and where the app is installed. */
async function access(c: Context<Env_>): Promise<Access> {
  const { github, policy } = services(c.env);
  const name = `${c.req.param("owner")}/${c.req.param("repo")}`;
  // Both lookups are independent, so they run together.
  const [repo, installation] = await Promise.all([
    github.user(c.get("session").token).repo(name),
    github.installationFor(name),
  ]);
  if (!repo || !(repo.permissions?.push || repo.permissions?.admin)) {
    return { ok: false, notFound: true };
  }
  if (repo.private && !allowlisted(policy.privateAllowlist, repo.full_name)) {
    return { ok: false, status: { status: "not allowed" } };
  }
  if (!installation) {
    return {
      ok: false,
      status: { status: "not installed", installUrl: installUrl(c.env) },
    };
  }
  return { ok: true, repo: repo.full_name, installation };
}

function previews(env: Env, repo: string) {
  return env.PREVIEWS.get(env.PREVIEWS.idFromName(repo.toLowerCase()));
}

/** Respond for a repository the user may not tune, or run the handler. */
async function withRepo(
  c: Context<Env_>,
  handler: (found: Extract<Access, { ok: true }>) => Promise<Response>,
): Promise<Response> {
  const found = await access(c);
  if (found.ok) return handler(found);
  if ("notFound" in found) return c.json({ error: "Not found" }, 404);
  return c.json({ error: "Rubberstamp can't serve this repository" }, 409);
}

api.get("/repos/:owner/:repo", async (c) => {
  const found = await access(c);
  if (!found.ok) {
    if ("notFound" in found) return c.json({ error: "Not found" }, 404);
    return c.json(found.status);
  }
  const { github, store, budgets } = services(c.env);
  const { repo, installation } = found;
  const client = github.repo(installation.id, repo);
  const [source, labels, used] = await Promise.all([
    client.config(),
    client.labels(),
    store.usage(installation.id, budgetPeriod(new Date())),
  ]);
  if (source === null) {
    return c.json({ status: "no config" } satisfies RepoStatus);
  }
  const parsed = parseConfig(source);
  if (!parsed.ok) {
    return c.json({
      status: "invalid config",
      errors: parsed.errors,
    } satisfies RepoStatus);
  }
  const { groups, warnings } = resolveLabels(parsed.config, labels);
  const status: RepoStatus = {
    status: "ready",
    config: {
      source,
      labels,
      groups: previewGroups(groups),
      warnings,
    },
    budget: {
      used,
      limit: budgetFor(budgets, installation.account).installation,
    },
  };
  return c.json(status);
});

api.get("/repos/:owner/:repo/log", (c) =>
  withRepo(c, async ({ repo }) => {
    const entries = await services(c.env).store.recentRuns(repo, 50);
    return c.json({ entries } satisfies Log);
  }),
);

api.get("/repos/:owner/:repo/preview", (c) =>
  withRepo(c, async ({ repo }) =>
    c.json({
      preview: await previews(c.env, repo).preview(),
    } satisfies PreviewState),
  ),
);

api.post("/repos/:owner/:repo/preview", (c) =>
  withRepo(c, async ({ repo, installation }) => {
    const stream = await previews(c.env, repo).build({
      installationId: installation.id,
      account: installation.account,
      repo,
    });
    return new Response(stream, {
      headers: { "Content-Type": "application/x-ndjson" },
    });
  }),
);
