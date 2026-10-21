import {
  Account,
  Log,
  Me,
  PreviewEvent,
  PreviewState,
  RepoList,
  RepoStatus,
  type PreviewResult,
} from "@sargunv/rubberstamp-core";
import * as v from "valibot";

/** A failed API call, with the server's message when it gave one. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T extends v.GenericSchema>(
  schema: T,
  path: string,
  init?: RequestInit,
): Promise<v.InferOutput<T>> {
  const response = await fetch(path, init);
  if (!response.ok) {
    const body = v.safeParse(
      v.object({ error: v.string() }),
      await response.json().catch(() => null),
    );
    throw new ApiError(
      response.status,
      body.success ? body.output.error : response.statusText,
    );
  }
  return v.parse(schema, await response.json());
}

/** The signed-in user, or null. */
export async function getMe(): Promise<Me | null> {
  try {
    return await call(Me, "/api/me");
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

/** Repositories the user can tune. */
export function getRepos(): Promise<RepoList> {
  return call(RepoList, "/api/repos");
}

/** A repository's status, or null if the user can't see or tune it. */
export async function getRepo(name: string): Promise<RepoStatus | null> {
  try {
    return await call(RepoStatus, `/api/repos/${name}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

/** An account's installation, or null if the user can't see it. */
export async function getAccount(owner: string): Promise<Account | null> {
  try {
    return await call(Account, `/api/accounts/${owner}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export function getLog(name: string): Promise<Log> {
  return call(Log, `/api/repos/${name}/log`);
}

export function getPreview(name: string): Promise<PreviewState> {
  return call(PreviewState, `/api/repos/${name}/preview`);
}

/** Run a preview, reporting each judged item, and resolve with its result. */
export async function runPreview(
  name: string,
  onProgress: (done: number, total: number) => void,
): Promise<PreviewResult> {
  const response = await fetch(`/api/repos/${name}/preview`, {
    method: "POST",
  });
  if (!response.ok || !response.body) {
    const body = v.safeParse(
      v.object({ error: v.string() }),
      await response.json().catch(() => null),
    );
    return {
      ok: false,
      error: body.success ? body.output.error : response.statusText,
    };
  }
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffered = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffered += value;
    const lines = buffered.split("\n");
    buffered = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = v.parse(PreviewEvent, JSON.parse(line));
      if (event.type === "result") return event.result;
      onProgress(event.done, event.total);
    }
  }
  return { ok: false, error: "The preview stopped before it finished." };
}

export async function signOut(): Promise<void> {
  const response = await fetch("/auth/sign-out", { method: "POST" });
  if (!response.ok) throw new ApiError(response.status, "Sign-out failed");
}
