/**
 * Fixed-window, in-memory rate limiter. Good enough for local development and a single instance.
 * On serverless hosting each instance has its own memory, so production should back this with a shared
 * store (for example Upstash Redis) behind the same interface.
 */
export interface RateLimiter {
  check(key: string): { allowed: boolean; retryAfterSeconds: number };
}

export function createRateLimiter(limit: number, windowMs: number, now: () => number = Date.now): RateLimiter {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return {
    check(key) {
      const t = now();
      // Opportunistic cleanup keeps the map bounded.
      if (hits.size > 5000) for (const [k, v] of hits) if (v.resetAt <= t) hits.delete(k);

      const entry = hits.get(key);
      if (!entry || entry.resetAt <= t) {
        hits.set(key, { count: 1, resetAt: t + windowMs });
        return { allowed: true, retryAfterSeconds: 0 };
      }
      entry.count += 1;
      return entry.count <= limit
        ? { allowed: true, retryAfterSeconds: 0 }
        : { allowed: false, retryAfterSeconds: Math.ceil((entry.resetAt - t) / 1000) };
    },
  };
}

export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "local";
}

/**
 * A cap on how many times something may happen per UTC day, kept in memory. It is a backstop for spend, not a
 * guarantee: serverless instances each count separately, so set the provider's own spend limit as well.
 */
export interface DailyBudget {
  take(): boolean;
}

export function createDailyBudget(limit: number, now: () => number = Date.now): DailyBudget {
  let day = "";
  let used = 0;
  return {
    take() {
      const today = new Date(now()).toISOString().slice(0, 10);
      if (today !== day) {
        day = today;
        used = 0;
      }
      if (used >= limit) return false;
      used += 1;
      return true;
    },
  };
}

/** AI_DAILY_CAP requests per day (default 300). */
export function dailyCapFromEnv(): number {
  const cap = Number(process.env.AI_DAILY_CAP);
  return Number.isFinite(cap) && cap > 0 ? Math.floor(cap) : 300;
}
