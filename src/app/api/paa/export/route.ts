import { z } from "zod";
import { applyBranding, runAction } from "@/lib/paa/actions/run";
import { documentFromExperience } from "@/lib/paa/documents/resolve";
import { DOC_KINDS } from "@/lib/paa/documents/types";
import { MAX_CALLS, executePlan, PlanError, validateForOrganization } from "@/lib/paa/orchestration/execute";
import { actionFailureMessage } from "@/lib/paa/orchestration/orchestrator";
import { ExperienceSchema } from "@/lib/paa/schemas/experience";
import { clientKey, createRateLimiter } from "@/lib/shared/rate-limit";

const MAX_BODY_BYTES = 32 * 1024;
const limiter = createRateLimiter(20, 60_000);

const Body = z.strictObject({
  organizationId: z.string().max(64),
  roleId: z.string().max(64),
  kind: z.enum(DOC_KINDS),
  /** The visitor's answer to "do you want this branded?"; company branding by default. */
  branded: z.boolean().optional(),
  experience: ExperienceSchema,
  calls: z
    .array(z.strictObject({ key: z.string().max(40), capabilityId: z.string().max(80), input: z.record(z.string(), z.unknown()) }))
    .min(1)
    .max(MAX_CALLS),
});

/**
 * One-click export (no model): turns the view on screen into a PDF, a slide deck or an email draft.
 * The plan is re-run under the caller's role, so the document can only contain data that role may see,
 * and the action itself is authorized separately before anything is generated.
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
    if (execution.failed) {
      return Response.json({ executions: execution.executions, actionError: "The data for this document is not available to your role." });
    }
    // The layout must still fit the data this role gets, or the document would misrepresent the view.
    const valid = validateForOrganization(session.organizationId, body.data.experience, execution.envelope);
    if (!valid.ok) return Response.json({ executions: execution.executions, actionError: "This view can't be exported as it stands." });

    const branding = applyBranding(session, body.data.branded ?? true);
    const document = documentFromExperience(body.data.kind, valid.spec, execution.envelope, session.organizationId, branding.branded);
    const action = await runAction(session, document);
    const brandingDenied = branding.record?.status === "denied" ? "Your current role isn't permitted to apply company branding, so the document is plain." : undefined;
    return Response.json({
      executions: [...execution.executions, ...(branding.record ? [branding.record] : []), action.record],
      deliverables: action.deliverable ? [action.deliverable] : [],
      actionError: action.record.status === "ok" ? brandingDenied : actionFailureMessage(body.data.kind, action.record.status),
    });
  } catch (error) {
    if (error instanceof PlanError) return Response.json({ error: "That request is not supported" }, { status: 400 });
    console.error("[paa] export failed:", error);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
