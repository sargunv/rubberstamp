import { Hono } from "hono";
import * as v from "valibot";

import { api, auth } from "./api.ts";
import { budgetFor } from "./budget.ts";
import { verifyWebhook } from "./github/auth.ts";
import { runLabelJob } from "./jobs/label.ts";
import { runPlanJob } from "./jobs/plan.ts";
import { services } from "./services.ts";
import { CloudflareStore } from "./store.ts";
import { webhookEffects } from "./webhooks.ts";

export { RepoPreviews } from "./preview/object.ts";

const JobFields = {
  installationId: v.number(),
  repoId: v.number(),
  repo: v.string(),
  number: v.number(),
};

const Job = v.variant("type", [
  v.object({ type: v.literal("label"), ...JobFields }),
  v.object({ type: v.literal("plan"), ...JobFields, head: v.string() }),
]);

/** How long a live run's decisions are kept. */
const RUN_RETENTION_DAYS = 180;

const app = new Hono<{ Bindings: Env }>();

// Everything else is the web app, served from static assets.
app.route("/auth", auth);
app.route("/api", api);

app.post("/webhooks/github", async (c) => {
  const body = await c.req.text();
  const signature = c.req.header("X-Hub-Signature-256") ?? null;
  if (!(await verifyWebhook(c.env.GITHUB_WEBHOOK_SECRET, body, signature))) {
    return c.text("bad signature", 401);
  }
  const event = c.req.header("X-GitHub-Event") ?? "";
  const effects = webhookEffects(
    event,
    JSON.parse(body),
    services(c.env).policy,
  );
  const store = new CloudflareStore(c.env.DB);
  await Promise.all([
    effects.jobs.length > 0
      ? c.env.JOBS.sendBatch(effects.jobs.map((body) => ({ body })))
      : undefined,
    ...effects.installations.map((i) =>
      store.saveInstallation(i.id, i.account, i.deleted),
    ),
    ...effects.forget.map((f) => store.forgetRuns(f.installationId, f.repoIds)),
  ]);
  return c.body(null, 204);
});

export default {
  fetch: app.fetch,

  async scheduled(_controller, env) {
    await new CloudflareStore(env.DB).pruneRuns(RUN_RETENTION_DAYS);
  },

  async queue(batch, env) {
    const { github, store, budgets, jev } = services(env);
    for (const message of batch.messages) {
      const job = v.safeParse(Job, message.body);
      if (!job.success) {
        console.error("Dropping malformed job", message.body);
        message.ack();
        continue;
      }
      const deps = {
        repo: github.repo(job.output.installationId, job.output.repo),
        store,
        ask: jev,
        model: env.JEV_MODEL,
        budget: budgetFor(budgets, job.output.repo.split("/")[0] ?? ""),
      };
      try {
        const outcome =
          job.output.type === "label"
            ? await runLabelJob(job.output, deps)
            : await runPlanJob(job.output, deps);
        console.log(
          `${job.output.type} ${job.output.repo}#${job.output.number}`,
          outcome,
        );
        message.ack();
      } catch (error) {
        console.error(`${job.output.repo}#${job.output.number}`, error);
        message.retry({ delaySeconds: 30 * message.attempts });
      }
    }
  },
} satisfies ExportedHandler<Env>;
