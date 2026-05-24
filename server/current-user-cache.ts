import type { CurrentUser } from "./routes/types";

/**
 * Short-lived in-memory cache for the per-request "current user" view.
 *
 * `requireAuth` runs on every authenticated API call and previously did:
 *   1. SELECT user_id FROM sessions WHERE token = ?
 *   2. UPDATE sessions SET last_seen_at = ? WHERE token = ?
 *   3. SELECT * FROM users WHERE id = ?
 *
 * For high request volumes (case lists, dashboard polling) step 3 is the
 * heaviest. We cache just the columns `CurrentUser` exposes; PHI / passwords
 * never enter this cache.
 *
 * Invalidation happens explicitly on user mutation, session deletion, or
 * sign-out. The TTL is a safety net for missed invalidations.
 */
const TTL_MS = 30 * 1000;
const MAX_ENTRIES = 5_000;

type Entry = { user: CurrentUser; userId: number; expiresAt: number };

const byToken = new Map<string, Entry>();
const tokensByUserId = new Map<number, Set<string>>();

function evictExpired(now: number): void {
  if (byToken.size <= MAX_ENTRIES) return;
  const expired: string[] = [];
  byToken.forEach((entry, token) => {
    if (entry.expiresAt <= now) expired.push(token);
  });
  for (const token of expired) untrack(token);
  if (byToken.size <= MAX_ENTRIES) return;
  // Hard cap: drop the oldest insertions (Map preserves insertion order).
  const overflow = byToken.size - MAX_ENTRIES;
  const victims: string[] = [];
  byToken.forEach((_entry, token) => {
    if (victims.length < overflow) victims.push(token);
  });
  for (const token of victims) untrack(token);
}

function untrack(token: string): void {
  const entry = byToken.get(token);
  if (!entry) return;
  byToken.delete(token);
  const set = tokensByUserId.get(entry.userId);
  if (!set) return;
  set.delete(token);
  if (set.size === 0) tokensByUserId.delete(entry.userId);
}

export function getCachedCurrentUser(token: string): CurrentUser | undefined {
  const entry = byToken.get(token);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    untrack(token);
    return undefined;
  }
  return entry.user;
}

export function rememberCurrentUser(token: string, user: CurrentUser): void {
  const now = Date.now();
  byToken.set(token, { user, userId: user.id, expiresAt: now + TTL_MS });
  let set = tokensByUserId.get(user.id);
  if (!set) {
    set = new Set();
    tokensByUserId.set(user.id, set);
  }
  set.add(token);
  evictExpired(now);
}

export function invalidateToken(token: string): void {
  untrack(token);
}

export function invalidateUserId(userId: number): void {
  const set = tokensByUserId.get(userId);
  if (!set) return;
  for (const token of Array.from(set)) untrack(token);
}

export function invalidateAll(): void {
  byToken.clear();
  tokensByUserId.clear();
}
