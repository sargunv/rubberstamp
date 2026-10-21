import {
  CONFIG_PATH,
  type PullFile,
  type RepoLabel,
} from "@sargunv/rubberstamp-core";
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

const Label = v.object({
  name: v.string(),
  description: v.nullable(v.string()),
});

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

/** The calls Rubberstamp makes against one repository. */
export interface RepoApi {
  readonly fullName: string;
  config(): Promise<string | null>;
  labels(): Promise<RepoLabel[]>;
  issue(number: number): Promise<Issue>;
  pullFiles(number: number): Promise<PullFile[]>;
  addLabels(number: number, labels: string[]): Promise<void>;
}

type Send = (
  method: string,
  path: string,
  init?: { body?: unknown; accept?: string },
) => Promise<Response>;

const PAGE = 100;
// Labels read only the first part of a diff, so a thousand files is plenty.
const MAX_FILE_PAGES = 10;

export class GitHubApp {
  private readonly tokens = new Map<
    number,
    { token: string; expires: number }
  >();
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

  async installationToken(installationId: number): Promise<string> {
    const cached = this.tokens.get(installationId);
    if (cached && cached.expires > Date.now() + 5 * 60_000) return cached.token;
    const send = this.request(() => appJwt(this.clientId, this.privateKey));
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

  async config(): Promise<string | null> {
    const path = `/repos/${this.fullName}/contents/${CONFIG_PATH}`;
    const response = await this.send("GET", path, {
      accept: "application/vnd.github.raw+json",
    });
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new GitHubError(response.status, path, await response.text());
    }
    return response.text();
  }

  labels(): Promise<RepoLabel[]> {
    return this.pages(Label, `/repos/${this.fullName}/labels`, 20);
  }

  issue(number: number): Promise<Issue> {
    return this.json(Issue, "GET", `/repos/${this.fullName}/issues/${number}`);
  }

  pullFiles(number: number): Promise<PullFile[]> {
    return this.pages(
      File,
      `/repos/${this.fullName}/pulls/${number}/files`,
      MAX_FILE_PAGES,
    );
  }

  async addLabels(number: number, labels: string[]): Promise<void> {
    await this.json(
      v.unknown(),
      "POST",
      `/repos/${this.fullName}/issues/${number}/labels`,
      { labels },
    );
  }
}
