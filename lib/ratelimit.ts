/**
 * Best-effort in-memory rate limiter (per server instance). Used to slow down
 * brute-force on login and abuse of the reset/verify email endpoints. It resets
 * on redeploy and is not shared across instances — a deliberate, lightweight
 * guard, not a security boundary on its own (the RPCs remain the real gate).
 */
type Bucket = { count: number; resetAt: number };
const store = new Map<string, Bucket>();

/** Returns true if the action is allowed, false if the key is over its limit. */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const b = store.get(key);
  if (!b || b.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (b.count >= limit) return false;
  b.count += 1;
  return true;
}
