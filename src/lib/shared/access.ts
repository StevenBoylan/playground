import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * A shared-password gate for the demo, so a public link cannot be found and used to spend API credits.
 *
 * It is on when DEMO_PASSWORD is set and off otherwise (local development). A visitor who enters the password gets a
 * signed, expiring cookie. The signing key is the password itself, so changing the password signs everyone out.
 */
export const ACCESS_COOKIE = "paa_access";
const DEFAULT_HOURS = 12;

export function accessPassword(): string | undefined {
  const password = process.env.DEMO_PASSWORD;
  return password && password.length > 0 ? password : undefined;
}

export function accessEnabled(): boolean {
  return accessPassword() !== undefined;
}

export function accessHours(): number {
  const hours = Number(process.env.ACCESS_HOURS);
  return Number.isFinite(hours) && hours > 0 ? hours : DEFAULT_HOURS;
}

const sign = (expiresAt: number, key: string) => createHmac("sha256", key).update(`paa-access.v1.${expiresAt}`).digest("hex");

/** Creates a cookie value that is valid until the access window ends. */
export function makeToken(now: number = Date.now()): string {
  const key = accessPassword();
  if (!key) throw new Error("Access control is not enabled");
  const expiresAt = now + accessHours() * 3_600_000;
  return `${expiresAt}.${sign(expiresAt, key)}`;
}

/** True only for an unexpired token signed with the current password. */
export function isValidToken(token: string | undefined, now: number = Date.now()): boolean {
  const key = accessPassword();
  if (!key || !token) return false;
  const [expiry, signature] = token.split(".");
  const expiresAt = Number(expiry);
  if (!Number.isFinite(expiresAt) || expiresAt <= now || !signature) return false;
  const expected = Buffer.from(sign(expiresAt, key));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Compares a guess with the password in constant time, and without revealing the password's length. */
export function passwordMatches(guess: string): boolean {
  const key = accessPassword();
  if (!key) return false;
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(guess), digest(key));
}

/** The only places a visitor may be sent after unlocking, so the unlock link cannot be used to redirect elsewhere. */
export function safeDestination(requested: string | null | undefined): string {
  return requested && /^\/paa(\/|$|\?)/.test(requested) && !requested.includes("//") ? requested : "/paa";
}
