import { z } from "zod";
import { runIntent, type IntentEvent, type IntentResult } from "@/lib/paa/orchestration/orchestrator";
import { getModelAdapter } from "@/lib/paa/orchestration/model-adapter";
import { ExperienceSchema } from "@/lib/paa/schemas/experience";
import { clientKey, createDailyBudget, createRateLimiter, dailyCapFromEnv } from "@/lib/shared/rate-limit";

const MAX_BODY_BYTES = 16 * 1024;
const limiter = createRateLimiter(12, 60_000);
const dailyBudget = createDailyBudget(dailyCapFromEnv());

const Body = z.strictObject({
  organizationId: z.string().max(64),
  roleId: z.string().max(64),
  text: z.string().trim().min(1).max(500),
  context: z
    .strictObject({
      turns: z
        .array(
          z.strictObject({
            request: z.string().max(500),
            calls: z
              .array(z.strictObject({ key: z.string().max(40), capabilityId: z.string().max(80), input: z.record(z.string(), z.unknown()) }))
              .max(4),
          }),
        )
        .max(3),
      experience: z.unknown().optional(),
    })
    .optional(),
});

type StreamMessage = ({ type: "event" } & IntentEvent) | { type: "result"; result: IntentResult } | { type: "error"; message: string };

const json = (body: unknown, status: number, headers?: Record<string, string>) => Response.json(body, { status, headers });

/** Streams newline-delimited JSON: progress events as the work happens, then the result. */
export async function POST(request: Request) {
  const adapter = getModelAdapter();
  if (!adapter) return json({ error: "ai_unavailable" }, 503);

  const limit = limiter.check(clientKey(request));
  if (!limit.allowed) {
    return json({ error: "Too many requests. Please wait a moment and try again." }, 429, {
      "Retry-After": String(limit.retryAfterSeconds),
    });
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json({ error: "Request too large" }, 413);
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const body = Body.safeParse(parsedJson);
  if (!body.success) return json({ error: "Invalid request" }, 400);

  // The client's view of the current experience is untrusted context: keep it only if it is a valid spec.
  const previousExperience = ExperienceSchema.safeParse(body.data.context?.experience);
  const context = body.data.context
    ? { turns: body.data.context.turns, experience: previousExperience.success ? previousExperience.data : undefined }
    : undefined;

  // Each model call costs money, so there is a ceiling on how many the demo will make in a day.
  if (!dailyBudget.take()) return json({ error: "The daily limit for this demo has been reached. Please try again tomorrow." }, 429);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (message: StreamMessage) => controller.enqueue(encoder.encode(`${JSON.stringify(message)}\n`));
      try {
        const result = await runIntent({
          session: { organizationId: body.data.organizationId, roleId: body.data.roleId },
          text: body.data.text,
          context,
          adapter,
          onEvent: (event) => send({ type: "event", ...event }),
        });
        send({ type: "result", result });
      } catch (error) {
        console.error("[paa] intent failed:", error);
        send({ type: "error", message: "Something went wrong. Please try again." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
