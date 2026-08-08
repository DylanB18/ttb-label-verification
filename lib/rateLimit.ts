import type { NextRequest } from "next/server";

/**
 * Best-effort, in-memory sliding-window rate limiter. This is a public demo
 * deployment calling a paid vision API, so the goal is to blunt casual abuse
 * / runaway cost, not to be airtight — a serverless instance restart or
 * multiple concurrent instances reset/split these counters. Fine for a
 * prototype; a real deployment would use a shared store (e.g. Redis).
 */
const buckets = new Map<string, number[]>();

export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);

  if (recent.length >= limit) {
    buckets.set(key, recent);
    return false;
  }

  recent.push(now);
  buckets.set(key, recent);
  return true;
}

export function getClientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}
