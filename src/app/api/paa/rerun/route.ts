import { z } from "zod";
import { MAX_CALLS, blockedComponents, executePlan, PlanError, scopeNotice, validateForOrganization } from "@/lib/paa/orchestration/execute";
import { ExperienceSchema } from "@/lib/paa/schemas/experience";
import { clientKey, createRateLimiter } from "@/lib/shared/rate-limit";

const MAX_BODY_BYTES = 32 * 1024;
const limiter = createRateLimiter(60, 60_000);

const Body = z.strictObject({
  organizationId: z.string().max(64),
  roleId: z.string().max(64),
  experience: ExperienceSchema,
  calls: z
    .array(z.strictObject({ key: z.string().max(40), capabilityId: z.string().max(80), input: z.record(z.string(), z.unknown()) }))
    .min(1)
    .max(MAX_CALLS),
});

/**
 * Re-runs an existing plan without the model: used when a visitor changes a filter or switches role.
 * Every call still goes through full authorization, validation and scoping; the layout is re-validated
 * against the new results, so a role that can't see the data gets a blocked view, not stale numbers.
 */
export async function POST(request: Request) {
  const limit = limiter.check(clientKey(request));
  if (!limit.allowed) {
    return Response.json({ error: "Too many requests. Please wait a moment." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return Response.json({ error: "Request too large" }, { status: 413 });
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const body = Body.safeParse(json);
  if (!body.success) return Response.json({ error: "Invalid request" }, { status: 400 });

  try {
    const session = { organizationId: body.data.organizationId, roleId: body.data.roleId };
    const execution = await executePlan(session, body.data.calls);
    const heading = body.data.experience.components.find((c) => c.type === "PageHeading");

    const candidate = execution.failed
      ? {
          version: "1",
          title: body.data.experience.title,
          components: [heading ?? { type: "PageHeading", id: "heading", text: body.data.experience.title }, ...blockedComponents()],
        }
      : {
          ...body.data.experience,
          components: execution.narrowed && !body.data.experience.components.some((c) => c.id === "scope")
            ? [body.data.experience.components[0], scopeNotice(), ...body.data.experience.components.slice(1)]
            : body.data.experience.components.filter((c) => !(c.id === "scope" && !execution.narrowed)),
        };

    let validated = validateForOrganization(session.organizationId, candidate, execution.envelope);
    if (!validated.ok) {
      // The old layout no longer fits the new data; show an honest blocked view instead.
      validated = validateForOrganization(
        session.organizationId,
        {
          version: "1",
          title: body.data.experience.title,
          components: [{ type: "PageHeading", id: "heading", text: body.data.experience.title }, ...blockedComponents()],
        },
        execution.envelope,
      );
    }
    if (!validated.ok) return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });

    return Response.json({ experience: validated.spec, envelope: execution.envelope, executions: execution.executions });
  } catch (error) {
    if (error instanceof PlanError) return Response.json({ error: "That request is not supported" }, { status: 400 });
    console.error("[paa] rerun failed:", error);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
