import * as v from "valibot";

export const DEFAULT_MODEL = "jev-latest";
export const DEFAULT_BASE_URL = "https://api.typesafe.ai";

export type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [key: string]: Json };

export type Question =
  | { type: "noul"; instructions: Json; criteria: { true: Json; false: Json } }
  | { type: "choice"; instructions: Json; criteria: Record<string, Json> };

export type Request = {
  model: string;
  state: Json;
  questions: Record<string, Question>;
};

const Probability = v.pipe(v.number(), v.minValue(0), v.maxValue(1));

const Answer = v.variant("type", [
  v.object({ type: v.literal("noul"), noul: Probability }),
  v.object({
    type: v.literal("choice"),
    choice: v.string(),
    probabilities: v.record(v.string(), Probability),
  }),
]);

const Response = v.object({
  model: v.string(),
  answers: v.record(v.string(), Answer),
  usage: v.object({ input_tokens: v.number() }),
});

export type Answer = v.InferOutput<typeof Answer>;
export type Response = v.InferOutput<typeof Response>;

export class JevError extends Error {
  constructor(
    readonly status: number,
    detail: string,
  ) {
    super(`Jev returned ${status}: ${detail}`);
  }
}

export type AskOptions = {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  signal?: AbortSignal;
  attempts?: number;
  sleep?: (ms: number) => Promise<void>;
};

const RETRYABLE = new Set([429, 500, 502, 503, 529]);

export async function ask(
  request: Request,
  options: AskOptions,
): Promise<Response> {
  const send = options.fetch ?? fetch;
  const sleep =
    options.sleep ??
    ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const attempts = options.attempts ?? 6;
  const url = `${(options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "")}/v1/systemone`;
  for (let attempt = 1; ; attempt++) {
    let response: globalThis.Response;
    try {
      response = await send(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
        ...(options.signal ? { signal: options.signal } : {}),
      });
    } catch (error) {
      if (options.signal?.aborted || attempt >= attempts) throw error;
      await sleep(2 ** attempt * 500);
      continue;
    }
    if (response.ok) return v.parse(Response, await response.json());
    const detail = await response.text();
    if (!RETRYABLE.has(response.status) || attempt >= attempts) {
      throw new JevError(response.status, detail);
    }
    const retryAfter = Number(response.headers.get("retry-after"));
    await sleep(
      Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : 2 ** attempt * 500,
    );
  }
}
