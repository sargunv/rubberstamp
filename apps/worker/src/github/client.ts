import { CONFIG_PATH, type PullFile } from "@sargunv/rubberstamp-core";
import * as v from "valibot";

import { appJwt } from "./auth.ts";

const API = "https://api.github.com";

export class GitHubError extends Error {
  constructor(
    readonly status: number,
    path: string,
    detail: string,
  ) {
    super(`GitHub ${status} for ${path}: ${detail.slice(0, 500)}`);
  }
}

const Token = v.object({ token: v.string(), expires_at: v.string() });

const Installation = v.object({
  id: v.number(),
  account: v.object({
    login: v.string(),
    type: v.optional(v.picklist(["User", "Organization"]), "User"),
  }),
});

export type UserInstallation = {
  id: number;
  account: string;
  type: "User" | "Organization";
};

const UserRepo = v.object({
  id: v.number(),
  full_name: v.string(),
  private: v.boolean(),
  archived: v.optional(v.boolean(), false),
  permissions: v.optional(v.object({ admin: v.boolean(), push: v.boolean() })),
});

export type UserRepo = v.InferOutput<typeof UserRepo>;

const User = v.object({ login: v.string(), avatar_url: v.string() });

const Label = v.object({
  name: v.string(),
  description: v.nullable(v.string()),
  color: v.string(),
});

export type ColoredLabel = v.InferOutput<typeof Label>;

const Issue = v.object({
  title: v.string(),
  body: v.nullable(v.string()),
  state: v.string(),
  labels: v.array(v.object({ name: v.string() })),
  pull_request: v.optional(v.unknown()),
});

const File = v.object({
  filename: v.string(),
  previous_filename: v.optional(v.string()),
  status: v.string(),
  additions: v.number(),
  deletions: v.number(),
  patch: v.optional(v.string()),
});

export type Issue = v.InferOutput<typeof Issue>;

const Pull = v.object({
  title: v.string(),
  body: v.nullable(v.string()),
  state: v.string(),
  head: v.object({ sha: v.string() }),
  base: v.object({
    ref: v.string(),
    sha: v.string(),
    repo: v.object({
      id: v.number(),
      full_name: v.string(),
      private: v.boolean(),
    }),
  }),
  changed_files: v.number(),
});

export type Pull = v.InferOutput<typeof Pull>;

const Compared = v.object({
  merge_base_commit: v.object({ sha: v.string() }),
  files: v.optional(v.array(File), []),
});

/** What `head` changes since its merge base with `base`, and that commit. */
export type Comparison = { mergeBase: string; files: PullFile[] };

const Repository = v.object({
  id: v.number(),
  full_name: v.string(),
  private: v.boolean(),
});

export type Repository = v.InferOutput<typeof Repository>;

const WorkflowRun = v.object({
  id: v.number(),
  event: v.string(),
  head_sha: v.string(),
  /**
   * The workflow file the run ran, such as `.github/workflows/ci.yml`, maybe
   * with the ref it came from after an `@`.
   */
  path: v.string(),
  created_at: v.string(),
  repository: v.object({ id: v.number() }),
});

export type WorkflowRun = v.InferOutput<typeof WorkflowRun>;

export type ConfigFile = { path: string; source: string };

const ListedItem = v.object({
  number: v.number(),
  title: v.string(),
  body: v.nullable(v.string()),
  state: v.string(),
  state_reason: v.optional(v.nullable(v.string())),
  draft: v.optional(v.boolean()),
  user: v.nullable(v.object({ login: v.string() })),
  created_at: v.string(),
  html_url: v.string(),
  labels: v.array(v.object({ name: v.string() })),
  pull_request: v.optional(
    v.object({ merged_at: v.optional(v.nullable(v.string())) }),
  ),
});

export type ListedItem = v.InferOutput<typeof ListedItem>;

/** The calls Rubberstamp makes against one repository. */
export interface RepoApi {
  readonly fullName: string;
  /** The config file on the default branch, or null if there is none. */
  config(): Promise<ConfigFile | null>;
  labels(): Promise<ColoredLabel[]>;
  /** The newest issues and pull requests, newest first. */
  recentItems(count: number): Promise<ListedItem[]>;
  issue(number: number): Promise<Issue>;
  /** The repository itself: its id, canonical name, and visibility. */
  repository(): Promise<Repository>;
  pull(number: number): Promise<Pull>;
  /** A pull request's changed files, up to the first thousand. */
  pullFiles(number: number): Promise<PullFile[]>;
  /**
   * The merge base of `base` and `head`, and the files `head` changes since
   * it, up to the first 300, or null if either commit is gone.
   */
  compare(base: string, head: string): Promise<Comparison | null>;
  addLabels(number: number, labels: string[]): Promise<void>;
  /** A GitHub Actions workflow run, or null if the repository has none. */
  workflowRun(runId: number): Promise<WorkflowRun | null>;
}

type Send = (
  method: string,
  path: string,
  init?: { body?: unknown; accept?: string },
) => Promise<Response>;

const PAGE = 100;
// Labels read only the first part of a diff, and CI plans every unit for a
// change this large, so a thousand files is plenty.
const MAX_FILE_PAGES = 10;

export class GitHubApp {
  private readonly tokens = new Map<
    number,
    { token: string; expires: number }
  >();
  private jwt: { token: Promise<string>; expires: number } | undefined;
  private readonly send: typeof fetch;

  constructor(
    private readonly clientId: string,
    private readonly privateKey: string,
    send: typeof fetch = (input, init) => fetch(input, init),
  ) {
    this.send = send;
  }

  private request(auth: () => Promise<string>): Send {
    return async (method, path, init = {}) => {
      const response = await this.send(`${API}${path}`, {
        method,
        headers: {
          Accept: init.accept ?? "application/vnd.github+json",
          Authorization: `Bearer ${await auth()}`,
          "User-Agent": "rubberstamp",
          "X-GitHub-Api-Version": "2022-11-28",
          ...(init.body === undefined
            ? {}
            : { "Content-Type": "application/json" }),
        },
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      });
      return response;
    };
  }

  /** The app's own JWT, reused until a minute before it expires. */
  private appToken(): Promise<string> {
    if (!this.jwt || this.jwt.expires < Date.now()) {
      this.jwt = {
        token: appJwt(this.clientId, this.privateKey),
        // appJwt tokens last nine minutes.
        expires: Date.now() + 8 * 60_000,
      };
    }
    return this.jwt.token;
  }

  async installationToken(installationId: number): Promise<string> {
    const cached = this.tokens.get(installationId);
    if (cached && cached.expires > Date.now() + 5 * 60_000) return cached.token;
    const send = this.request(() => this.appToken());
    const path = `/app/installations/${installationId}/access_tokens`;
    const response = await send("POST", path);
    if (!response.ok) {
      throw new GitHubError(response.status, path, await response.text());
    }
    const token = v.parse(Token, await response.json());
    this.tokens.set(installationId, {
      token: token.token,
      expires: Date.parse(token.expires_at),
    });
    return token.token;
  }

  /** The app's installation on a repository, or null if it has none. */
  async installationFor(
    fullName: string,
  ): Promise<{ id: number; account: string } | null> {
    const send = this.request(() => this.appToken());
    const path = `/repos/${fullName}/installation`;
    const response = await send("GET", path);
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new GitHubError(response.status, path, await response.text());
    }
    const installation = v.parse(Installation, await response.json());
    return { id: installation.id, account: installation.account.login };
  }

  /**
   * Whether a caller's token, such as a workflow's, can read a repository.
   * Asking by id keeps a renamed or recreated name from answering instead.
   */
  async canRead(token: string, repoId: number): Promise<boolean> {
    const send = this.request(async () => token);
    const path = `/repositories/${repoId}`;
    const response = await send("GET", path);
    if ([401, 403, 404].includes(response.status)) return false;
    if (!response.ok) {
      throw new GitHubError(response.status, path, await response.text());
    }
    return true;
  }

  /** Calls made as a signed-in user, with their user access token. */
  user(token: string): UserApi {
    return new UserClient(this.request(async () => token));
  }

  repo(installationId: number, fullName: string): RepoApi {
    return new RepoClient(
      fullName,
      this.request(() => this.installationToken(installationId)),
    );
  }
}

class RepoClient implements RepoApi {
  constructor(
    readonly fullName: string,
    private readonly send: Send,
  ) {}

  private async json<T extends v.GenericSchema>(
    schema: T,
    method: string,
    path: string,
    body?: unknown,
  ): Promise<v.InferOutput<T>> {
    const response = await this.send(method, path, { body });
    if (!response.ok) {
      throw new GitHubError(response.status, path, await response.text());
    }
    return v.parse(schema, await response.json());
  }

  private async pages<T extends v.GenericSchema>(
    schema: T,
    path: string,
    maxPages: number,
  ): Promise<v.InferOutput<T>[]> {
    const items: v.InferOutput<T>[] = [];
    for (let page = 1; page <= maxPages; page++) {
      const separator = path.includes("?") ? "&" : "?";
      const batch = await this.json(
        v.array(schema),
        "GET",
        `${path}${separator}per_page=${PAGE}&page=${page}`,
      );
      items.push(...batch);
      if (batch.length < PAGE) break;
    }
    return items;
  }

  async config(): Promise<ConfigFile | null> {
    const path = `/repos/${this.fullName}/contents/${CONFIG_PATH}`;
    const response = await this.send("GET", path, {
      accept: "application/vnd.github.raw+json",
    });
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new GitHubError(response.status, path, await response.text());
    }
    return { path: CONFIG_PATH, source: await response.text() };
  }

  labels(): Promise<ColoredLabel[]> {
    return this.pages(Label, `/repos/${this.fullName}/labels`, 20);
  }

  recentItems(count: number): Promise<ListedItem[]> {
    return this.json(
      v.array(ListedItem),
      "GET",
      `/repos/${this.fullName}/issues?state=all&sort=created&direction=desc&per_page=${Math.min(count, PAGE)}`,
    );
  }

  issue(number: number): Promise<Issue> {
    return this.json(Issue, "GET", `/repos/${this.fullName}/issues/${number}`);
  }

  repository(): Promise<Repository> {
    return this.json(Repository, "GET", `/repos/${this.fullName}`);
  }

  pull(number: number): Promise<Pull> {
    return this.json(Pull, "GET", `/repos/${this.fullName}/pulls/${number}`);
  }

  pullFiles(number: number): Promise<PullFile[]> {
    return this.pages(
      File,
      `/repos/${this.fullName}/pulls/${number}/files`,
      MAX_FILE_PAGES,
    );
  }

  async compare(base: string, head: string): Promise<Comparison | null> {
    // Three dots diff from the merge base, as a pull request's files do.
    const path = `/repos/${this.fullName}/compare/${base}...${head}`;
    const response = await this.send("GET", path);
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new GitHubError(response.status, path, await response.text());
    }
    const compared = v.parse(Compared, await response.json());
    return { mergeBase: compared.merge_base_commit.sha, files: compared.files };
  }

  async addLabels(number: number, labels: string[]): Promise<void> {
    await this.json(
      v.unknown(),
      "POST",
      `/repos/${this.fullName}/issues/${number}/labels`,
      { labels },
    );
  }

  async workflowRun(runId: number): Promise<WorkflowRun | null> {
    const path = `/repos/${this.fullName}/actions/runs/${runId}`;
    const response = await this.send("GET", path);
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new GitHubError(response.status, path, await response.text());
    }
    return v.parse(WorkflowRun, await response.json());
  }
}

/** What the signed-in user can see, through the app. */
export interface UserApi {
  me(): Promise<{ login: string; avatarUrl: string }>;
  /** The app's installations the user can see. */
  installations(): Promise<UserInstallation[]>;
  /** Repositories in one installation that the user can see. */
  installationRepos(installationId: number): Promise<UserRepo[]>;
  /** Repositories in the app's installations that the user can see. */
  repos(): Promise<UserRepo[]>;
  /** The user's view of one repository, or null if they can't see it. */
  repo(fullName: string): Promise<UserRepo | null>;
}

// One account with a thousand repositories is ten pages.
const MAX_REPO_PAGES = 20;

class UserClient implements UserApi {
  constructor(private readonly send: Send) {}

  private async json<T extends v.GenericSchema>(
    schema: T,
    path: string,
  ): Promise<v.InferOutput<T>> {
    const response = await this.send("GET", path);
    if (!response.ok) {
      throw new GitHubError(response.status, path, await response.text());
    }
    return v.parse(schema, await response.json());
  }

  async me() {
    const user = await this.json(User, "/user");
    return { login: user.login, avatarUrl: user.avatar_url };
  }

  async installations(): Promise<UserInstallation[]> {
    const { installations } = await this.json(
      v.object({ installations: v.array(Installation) }),
      `/user/installations?per_page=${PAGE}`,
    );
    return installations.map((i) => ({
      id: i.id,
      account: i.account.login,
      type: i.account.type,
    }));
  }

  async installationRepos(installationId: number): Promise<UserRepo[]> {
    const repos: UserRepo[] = [];
    for (let page = 1; page <= MAX_REPO_PAGES; page++) {
      const { repositories } = await this.json(
        v.object({ repositories: v.array(UserRepo) }),
        `/user/installations/${installationId}/repositories?per_page=${PAGE}&page=${page}`,
      );
      repos.push(...repositories);
      if (repositories.length < PAGE) break;
    }
    return repos;
  }

  async repos(): Promise<UserRepo[]> {
    const installations = await this.installations();
    const lists = await Promise.all(
      installations.map((i) => this.installationRepos(i.id)),
    );
    return lists.flat();
  }

  async repo(fullName: string): Promise<UserRepo | null> {
    const path = `/repos/${fullName}`;
    const response = await this.send("GET", path);
    if (response.status === 404 || response.status === 403) return null;
    if (!response.ok) {
      throw new GitHubError(response.status, path, await response.text());
    }
    return v.parse(UserRepo, await response.json());
  }
}
