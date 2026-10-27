import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as access } from "@/app/api/access/route";
import { proxy } from "@/proxy";
import { ACCESS_COOKIE, accessEnabled, isValidToken, makeToken, passwordMatches, safeDestination } from "@/lib/shared/access";
import { createDailyBudget } from "@/lib/shared/rate-limit";

const saved = { password: process.env.DEMO_PASSWORD, hours: process.env.ACCESS_HOURS };
beforeEach(() => {
  process.env.DEMO_PASSWORD = "correct horse battery staple";
  delete process.env.ACCESS_HOURS;
});
afterEach(() => {
  if (saved.password === undefined) delete process.env.DEMO_PASSWORD;
  else process.env.DEMO_PASSWORD = saved.password;
  if (saved.hours === undefined) delete process.env.ACCESS_HOURS;
  else process.env.ACCESS_HOURS = saved.hours;
});

const guess = (password: unknown, ip = `access-${Math.random()}`) =>
  new Request("http://localhost/api/access", { method: "POST", body: JSON.stringify({ password }), headers: { "x-forwarded-for": ip } });

describe("the access token", () => {
  it("is valid for the access window, then expires", () => {
    const now = 1_000_000;
    const token = makeToken(now);
    expect(isValidToken(token, now + 1000)).toBe(true);
    expect(isValidToken(token, now + 11.9 * 3_600_000)).toBe(true);
    expect(isValidToken(token, now + 12.1 * 3_600_000)).toBe(false);
  });

  it("honours a custom window", () => {
    process.env.ACCESS_HOURS = "1";
    const token = makeToken(0);
    expect(isValidToken(token, 30 * 60_000)).toBe(true);
    expect(isValidToken(token, 61 * 60_000)).toBe(false);
  });

  it("rejects tampered, forged and malformed tokens", () => {
    const token = makeToken(Date.now());
    const [expiry, signature] = token.split(".");
    expect(isValidToken(`${Number(expiry) + 99999999}.${signature}`)).toBe(false);
    expect(isValidToken(`${expiry}.${"0".repeat(signature.length)}`)).toBe(false);
    expect(isValidToken(`${expiry}.`)).toBe(false);
    for (const bad of [undefined, "", "garbage", "123.abc", "NaN.deadbeef", `${expiry}`]) expect(isValidToken(bad), String(bad)).toBe(false);
  });

  it("signs everyone out when the password changes", () => {
    const token = makeToken(Date.now());
    expect(isValidToken(token)).toBe(true);
    process.env.DEMO_PASSWORD = "a different password";
    expect(isValidToken(token)).toBe(false);
  });

  it("is simply off when no password is configured", () => {
    delete process.env.DEMO_PASSWORD;
    expect(accessEnabled()).toBe(false);
    expect(isValidToken("anything")).toBe(false);
    expect(passwordMatches("anything")).toBe(false);
  });
});

describe("password checking", () => {
  it("accepts only the exact password", () => {
    expect(passwordMatches("correct horse battery staple")).toBe(true);
    for (const wrong of ["", "correct horse battery stapl", "Correct horse battery staple", "correct horse battery staple ", "x".repeat(5000)]) {
      expect(passwordMatches(wrong), wrong.slice(0, 20)).toBe(false);
    }
  });
});

describe("the redirect after unlocking", () => {
  it("only ever leads back into the demo", () => {
    expect(safeDestination("/paa")).toBe("/paa");
    expect(safeDestination("/paa?x=1")).toBe("/paa?x=1");
    expect(safeDestination("/paa/anything")).toBe("/paa/anything");
    for (const evil of ["https://evil.example", "//evil.example", "/other", "/paa//evil.example", "/paaa", "", null, undefined]) {
      expect(safeDestination(evil), String(evil)).toBe("/paa");
    }
  });
});

describe("the proxy", () => {
  const request = (path: string, token?: string) =>
    new NextRequest(`http://localhost${path}`, { headers: token ? { cookie: `${ACCESS_COOKIE}=${token}` } : {} });

  it("sends a visitor without access to the unlock screen, remembering where they were going", () => {
    const res = proxy(request("/paa?x=1"));
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/unlock");
    expect(location.searchParams.get("next")).toBe("/paa?x=1");
  });

  it("answers API calls without access with 401, so the API cannot be used to spend credits", async () => {
    for (const path of ["/api/paa/intent", "/api/paa/run", "/api/paa/rerun", "/api/paa/export"]) {
      const res = proxy(request(path));
      expect(res.status, path).toBe(401);
      expect(await res.json()).toEqual({ error: "locked" });
    }
  });

  it("lets a visitor with a valid cookie through, and rejects an expired or forged one", () => {
    expect(proxy(request("/paa", makeToken())).headers.get("x-middleware-next")).toBe("1");
    expect(proxy(request("/api/paa/run", makeToken())).headers.get("x-middleware-next")).toBe("1");
    expect(proxy(request("/api/paa/run", makeToken(Date.now() - 13 * 3_600_000))).status).toBe(401);
    expect(proxy(request("/api/paa/run", "1.forged")).status).toBe(401);
  });

  it("does nothing when no password is configured", () => {
    delete process.env.DEMO_PASSWORD;
    expect(proxy(request("/paa")).headers.get("x-middleware-next")).toBe("1");
    expect(proxy(request("/api/paa/run")).headers.get("x-middleware-next")).toBe("1");
  });
});

describe("/api/access", () => {
  it("issues a signed, http-only cookie for the right password", async () => {
    const res = await access(guess("correct horse battery staple"));
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${ACCESS_COOKIE}=`);
    expect(cookie.toLowerCase()).toContain("httponly");
    expect(cookie.toLowerCase()).toContain("samesite=lax");
    const token = decodeURIComponent(cookie.split(";")[0].split("=").slice(1).join("="));
    expect(isValidToken(token)).toBe(true);
  });

  it("refuses a wrong password without issuing a cookie", async () => {
    const res = await access(guess("nope"));
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(await res.json()).toEqual({ error: "Incorrect password" });
  });

  it("rejects malformed bodies", async () => {
    expect((await access(new Request("http://localhost/api/access", { method: "POST", body: "not json", headers: { "x-forwarded-for": "m1" } }))).status).toBe(400);
    expect((await access(guess(12345, "m2"))).status).toBe(400);
    expect((await access(new Request("http://localhost/api/access", { method: "POST", body: JSON.stringify({ password: "x", extra: 1 }), headers: { "x-forwarded-for": "m3" } }))).status).toBe(400);
    expect((await access(new Request("http://localhost/api/access", { method: "POST", body: "x".repeat(5000), headers: { "x-forwarded-for": "m4" } }))).status).toBe(413);
  });

  it("limits guessing: eight attempts, then a pause", async () => {
    const ip = "brute-force-test";
    const statuses: number[] = [];
    for (let i = 0; i < 10; i++) statuses.push((await access(guess("wrong", ip))).status);
    expect(statuses.slice(0, 8).every((s) => s === 401)).toBe(true);
    expect(statuses.slice(8)).toEqual([429, 429]);
    // Even the right password is refused while the visitor is paused.
    expect((await access(guess("correct horse battery staple", ip))).status).toBe(429);
  }, 20_000);

  it("is a no-op when no password is configured", async () => {
    delete process.env.DEMO_PASSWORD;
    const res = await access(guess("anything"));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});

describe("the daily AI cap", () => {
  it("allows up to the limit each UTC day, and starts again the next day", () => {
    let now = Date.UTC(2026, 9, 27, 12);
    const budget = createDailyBudget(3, () => now);
    expect([budget.take(), budget.take(), budget.take(), budget.take()]).toEqual([true, true, true, false]);
    now = Date.UTC(2026, 9, 28, 0, 1);
    expect(budget.take()).toBe(true);
  });
});
