import { ask, type Request } from "@sargunv/rubberstamp-core";
import { Hono } from "hono";
import * as v from "valibot";

import { verifyWebhook } from "./github/auth.ts";
import { GitHubApp } from "./github/client.ts";
import { runLabelJob } from "./jobs/label.ts";
import { CloudflareStore } from "./store.ts";
import { webhookEffects, type Policy } from "./webhooks.ts";

const Job = v.object({
  type: v.literal("label"),
  installationId: v.number(),
  repoId: v.number(),
  repo: v.string(),
  number: v.number(),
});

function policy(env: Env): Policy {
  return {
    privateAllowlist: new Set(
      env.PRIVATE_ALLOWLIST.split(",")
        .map((owner) => owner.trim().toLowerCase())
        .filter(Boolean),
    ),
  };
}

const app = new Hono<{ Bindings: Env }>();

app.get("/", (c) => c.text("rubberstamp"));

app.post("/webhooks/github", async (c) => {
  const body = await c.req.text();
  const signature = c.req.header("X-Hub-Signature-256") ?? null;
  if (!(await verifyWebhook(c.env.GITHUB_WEBHOOK_SECRET, body, signature))) {
    return c.text("bad signature", 401);
  }
  const event = c.req.header("X-GitHub-Event") ?? "";
  const effects = webhookEffects(event, JSON.parse(body), policy(c.env));
  const store = new CloudflareStore(c.env.DB, c.env.STATES);
  await Promise.all([
    effects.jobs.length > 0
      ? c.env.JOBS.sendBatch(effects.jobs.map((body) => ({ body })))
      : undefined,
    ...effects.labelEvents.map((e) => store.recordLabelEvent(e)),
    ...effects.installations.map((i) =>
      store.saveInstallation(i.id, i.account, i.deleted),
    ),
  ]);
  return c.body(null, 204);
});

export default {
  fetch: app.fetch,

  async queue(batch, env) {
    const github = new GitHubApp(env.GITHUB_APP_ID, env.GITHUB_PRIVATE_KEY);
    const store = new CloudflareStore(env.DB, env.STATES);
    const jev = (request: Request) =>
      ask(request, { apiKey: env.TYPESAFE_API_KEY });
    for (const message of batch.messages) {
      const job = v.safeParse(Job, message.body);
      if (!job.success) {
        console.error("Dropping malformed job", message.body);
        message.ack();
        continue;
      }
      try {
        const outcome = await runLabelJob(job.output, {
          repo: github.repo(job.output.installationId, job.output.repo),
          store,
          ask: jev,
          model: env.JEV_MODEL,
          dailyTokens: Number(env.DAILY_TOKENS),
        });
        console.log(`${job.output.repo}#${job.output.number}`, outcome);
        message.ack();
      } catch (error) {
        console.error(`${job.output.repo}#${job.output.number}`, error);
        message.retry({ delaySeconds: 30 * message.attempts });
      }
    }
  },
} satisfies ExportedHandler<Env>;
