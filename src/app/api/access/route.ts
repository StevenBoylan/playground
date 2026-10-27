import { NextResponse } from "next/server";
import { z } from "zod";
import { ACCESS_COOKIE, accessEnabled, accessHours, makeToken, passwordMatches } from "@/lib/shared/access";
import { clientKey, createRateLimiter } from "@/lib/shared/rate-limit";

const MAX_BODY_BYTES = 1024;
/** Slows guessing: eight attempts per ten minutes per visitor. */
const attempts = createRateLimiter(8, 10 * 60_000);
const FAILURE_DELAY_MS = 600;

const Body = z.strictObject({ password: z.string().max(200) });

/** Exchanges the demo password for a signed, expiring cookie. */
export async function POST(request: Request) {
  if (!accessEnabled()) return NextResponse.json({ ok: true });

  const limit = attempts.check(clientKey(request));
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Please wait a few minutes." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return NextResponse.json({ error: "Request too large" }, { status: 413 });
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const body = Body.safeParse(json);
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  if (!passwordMatches(body.data.password)) {
    await new Promise((resolve) => setTimeout(resolve, FAILURE_DELAY_MS));
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ACCESS_COOKIE, makeToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.round(accessHours() * 3600),
  });
  return response;
}
