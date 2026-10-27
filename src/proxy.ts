import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, accessEnabled, isValidToken } from "@/lib/shared/access";

/**
 * Keeps the demo behind a password when one is configured. It covers the page and every API route under /api/paa,
 * so the API cannot be called directly to spend credits.
 */
export function proxy(request: NextRequest) {
  if (!accessEnabled()) return NextResponse.next();
  if (isValidToken(request.cookies.get(ACCESS_COOKIE)?.value)) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "locked" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  const unlock = new URL("/unlock", request.url);
  unlock.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(unlock);
}

export const config = {
  matcher: ["/paa/:path*", "/api/paa/:path*"],
};
