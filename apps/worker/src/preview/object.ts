import { Preview, type PreviewEvent } from "@sargunv/rubberstamp-core";
import { DurableObject } from "cloudflare:workers";
import * as v from "valibot";

import { budgetFor, budgetPeriod } from "../budget.ts";
import { services } from "../services.ts";
import { buildPreview, type BuildResult } from "./build.ts";

/** How many of a repository's newest items a preview labels. */
export const SAMPLE_SIZE = 20;

/** A preview is deleted after this long without anyone opening it. */
const IDLE_MS = 60 * 24 * 60 * 60 * 1000;

export type PreviewTarget = {
  installationId: number;
  account: string;
  repo: string;
};

/**
 * One repository's preview. A single object per repository means a second
 * click while a preview runs waits for it instead of paying twice.
 */
export class RepoPreviews extends DurableObject<Env> {
  private building: Promise<BuildResult> | undefined;
  private progress: Extract<PreviewEvent, { type: "progress" }> | undefined;
  private readonly listeners = new Set<(event: PreviewEvent) => void>();

  async preview(): Promise<Preview | null> {
    const stored = v.safeParse(Preview, await this.ctx.storage.get("preview"));
    if (!stored.success) return null;
    await this.touch();
    return stored.output;
  }

  /**
   * Run a preview, or join the one already running, as a stream of
   * newline-delimited progress events ending in the result.
   */
  build(target: PreviewTarget): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    let listener: ((event: PreviewEvent) => void) | undefined;
    return new ReadableStream({
      start: (controller) => {
        listener = (event) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          if (event.type === "result") {
            if (listener) this.listeners.delete(listener);
            controller.close();
          }
        };
        this.listeners.add(listener);
        if (this.progress) listener(this.progress);
        this.building ??= this.run(target).finally(() => {
          this.building = undefined;
          this.progress = undefined;
        });
      },
      cancel: () => {
        if (listener) this.listeners.delete(listener);
      },
    });
  }

  private emit(event: PreviewEvent) {
    if (event.type === "progress") this.progress = event;
    // A listener may remove itself; deleting visited Set entries is safe.
    for (const listener of this.listeners) listener(event);
  }

  private async run(target: PreviewTarget): Promise<BuildResult> {
    let result: BuildResult;
    try {
      result = await this.attempt(target);
    } catch (error) {
      console.error(target.repo, error);
      result = { ok: false, error: "The preview failed. Try again." };
    }
    this.emit({ type: "result", result });
    return result;
  }

  private async attempt(target: PreviewTarget): Promise<BuildResult> {
    const { github, store, budgets, jev } = services(this.env);
    const period = budgetPeriod(new Date());
    const budget = budgetFor(budgets, target.account);
    if (
      (await store.usage(target.installationId, period)) >= budget.installation
    ) {
      return { ok: false, error: "This month's budget is spent." };
    }
    if ((await store.globalUsage(period)) >= budget.global) {
      return { ok: false, error: "Rubberstamp's monthly budget is spent." };
    }
    const result = await buildPreview({
      repo: github.repo(target.installationId, target.repo),
      ask: jev,
      model: this.env.JEV_MODEL,
      count: SAMPLE_SIZE,
      onProgress: (done, total) => this.emit({ type: "progress", done, total }),
    });
    if (!result.ok) return result;
    await store.addUsage(
      target.installationId,
      period,
      target.repo,
      "labels",
      result.preview.inputTokens,
    );
    await this.ctx.storage.put("preview", result.preview);
    await this.touch();
    return result;
  }

  private touch() {
    return this.ctx.storage.setAlarm(Date.now() + IDLE_MS);
  }

  override async alarm() {
    await this.ctx.storage.deleteAll();
  }
}
