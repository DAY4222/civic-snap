// Daily rate limits for the Edge Functions. No Deno or Supabase imports, so Jest can test it;
// runs.ts supplies the database operations.
//
// A request inserts its own 'pending' row first and only then counts today's rows. Of any two
// requests, the one that counts later always sees the other's row, so a burst of parallel
// requests cannot get past a cap. The cost: a simultaneous burst bigger than the room left
// under a cap can be refused entirely. Refused rows are deleted, so later requests get the room.

export type DailyLimits = {
  global: number;
  perInstall: number;
};

/** Today's counted rows, including the caller's own reservation. */
export type RunCounts = {
  global: number;
  install: number;
};

export type RateLimitResult =
  | { ok: true }
  | {
      ok: false;
      error: 'global_daily_limit_reached' | 'install_daily_limit_reached' | 'rate_limit_unavailable';
      status: 429 | 503;
    };

export type RunCountFilters = ReturnType<typeof buildRunCountFilters>;

/** The runs-table operations for one request's reservation. */
export type ReservationStore = {
  /** Inserts the request's pending row; resolves false if that failed. */
  insertPending: () => Promise<boolean>;
  /** Counts today's counted rows, for one install or for everyone; resolves null on failure. */
  count: (filters: RunCountFilters, installIdHash?: string) => Promise<number | null>;
  /** Deletes the request's pending row. */
  release: () => Promise<void>;
};

/**
 * How long a pending row counts. A request finishes its row within seconds (Gemini gives up
 * after 20 s), so an older pending row belongs to a function that died before finishing.
 */
export const STALE_PENDING_MS = 5 * 60 * 1000;

const RATE_LIMIT_UNAVAILABLE = {
  ok: false,
  error: 'rate_limit_unavailable',
  status: 503,
} as const;

/**
 * Holds a place in today's limits: insert the pending row, count with it included, and give
 * the place back when a limit is exceeded or the limits can't be checked.
 */
export async function reserveRateLimitedRun(
  store: ReservationStore,
  input: { installIdHash: string; limits: DailyLimits; now: Date }
): Promise<RateLimitResult> {
  if (!(await store.insertPending())) return RATE_LIMIT_UNAVAILABLE;

  const filters = buildRunCountFilters(input.now);
  const [global, install] = await Promise.all([
    store.count(filters),
    store.count(filters, input.installIdHash),
  ]);
  const result =
    global == null || install == null
      ? RATE_LIMIT_UNAVAILABLE
      : decideRateLimit({ global, install }, input.limits);

  if (!result.ok) await store.release();
  return result;
}

/** The counts include the request's own reservation, so each may reach its cap but not pass it. */
export function decideRateLimit(counts: RunCounts, limits: DailyLimits): RateLimitResult {
  if (counts.global > limits.global) {
    return { ok: false, error: 'global_daily_limit_reached', status: 429 };
  }
  if (counts.install > limits.perInstall) {
    return { ok: false, error: 'install_daily_limit_reached', status: 429 };
  }
  return { ok: true };
}

/** The UTC day `now` falls in, and the time before which pending rows stop counting. */
export function getRateLimitWindow(now: Date) {
  const dayStart = new Date(now);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  return {
    dayEnd: dayEnd.toISOString(),
    dayStart: dayStart.toISOString(),
    pendingSince: new Date(now.getTime() - STALE_PENDING_MS).toISOString(),
  };
}

/**
 * Today's rows that count: finished ones ('ok' or 'error') and pending ones that aren't stale.
 * Not filtered by provider, model or prompt version, so changing those resets no one's quota.
 */
export function buildRunCountFilters(now: Date) {
  const window = getRateLimitWindow(now);
  return {
    createdAtEnd: window.dayEnd,
    createdAtStart: window.dayStart,
    // A PostgREST `or` filter; the timestamp is quoted because it contains reserved characters.
    countedRowsFilter: `status.neq.pending,created_at.gte."${window.pendingSince}"`,
  };
}
