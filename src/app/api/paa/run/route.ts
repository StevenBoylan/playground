import { z } from "zod";
import { RunError, runCurated } from "@/lib/paa/orchestration/curated";

const MAX_BODY_BYTES = 2048;

const Body = z.strictObject({
  organizationId: z.string().max(64),
  roleId: z.string().max(64),
  promptId: z.string().max(64),
});

export async function POST(request: Request) {
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
    const run = await runCurated(
      { organizationId: body.data.organizationId, roleId: body.data.roleId },
      body.data.promptId,
    );
    return Response.json(run);
  } catch (error) {
    if (error instanceof RunError) return Response.json({ error: "That request is not supported" }, { status: 400 });
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
