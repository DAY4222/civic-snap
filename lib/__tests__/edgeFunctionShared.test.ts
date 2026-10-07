import {
  STALE_PENDING_MS,
  buildRunCountFilters,
  decideRateLimit,
  getRateLimitWindow,
  reserveRateLimitedRun,
  type ReservationStore,
} from '../../supabase/functions/_shared/rateLimit';
import {
  describeError,
  parseJsonText,
  truncateText,
} from '../../supabase/functions/_shared/text';

const NOW = new Date('2026-10-06T13:45:00.000Z');
const LIMITS = { global: 100, perInstall: 3 };
const RESERVATION = { installIdHash: 'hash-1', limits: LIMITS, now: NOW };

/** A runs table where every row belongs to one install, so both counts are the row count. */
function createRunsTable() {
  const rows = new Set<string>();
  let nextId = 0;

  return {
    rows,
    store(delay: () => Promise<void> = async () => {}): ReservationStore {
      const runId = `run-${nextId++}`;
      return {
        insertPending: async () => {
          await delay();
          rows.add(runId);
          return true;
        },
        count: async () => {
          await delay();
          return rows.size;
        },
        release: async () => {
          await delay();
          rows.delete(runId);
        },
      };
    },
  };
}

/** Seeded, so every run of the test explores the same interleavings. */
function createRandomDelay(seed: number) {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return new Promise<void>((resolve) => setTimeout(resolve, state % 4));
  };
}

describe('shared Edge Function text helpers', () => {
  it('trims before truncating', () => {
    expect(truncateText('  marker tag on sign  ', 240)).toBe('marker tag on sign');
    expect(truncateText('  abcdef', 3)).toBe('abc');
  });

  it('parses fenced JSON', () => {
    expect(parseJsonText('```json\n{"body":"ok"}\n```')).toEqual({ body: 'ok' });
    expect(parseJsonText(' {"suggestedLabels":[]} ')).toEqual({ suggestedLabels: [] });
  });

  it('describes thrown values briefly', () => {
    expect(describeError(new Error('Gemini returned 503'))).toBe('Gemini returned 503');
    expect(describeError('timeout')).toBe('timeout');
    expect(describeError(new Error('x'.repeat(500)))).toHaveLength(240);
  });
});

describe('shared Edge Function rate limit', () => {
  it('uses the UTC day and stops counting pending rows after five minutes', () => {
    expect(STALE_PENDING_MS).toBe(5 * 60 * 1000);
    expect(getRateLimitWindow(NOW)).toEqual({
      dayEnd: '2026-10-07T00:00:00.000Z',
      dayStart: '2026-10-06T00:00:00.000Z',
      pendingSince: '2026-10-06T13:40:00.000Z',
    });
    expect(getRateLimitWindow(new Date('2026-10-07T00:02:00.000Z'))).toEqual({
      dayEnd: '2026-10-08T00:00:00.000Z',
      dayStart: '2026-10-07T00:00:00.000Z',
      pendingSince: '2026-10-06T23:57:00.000Z',
    });
  });

  it('counts every run of the day whatever its provider, model or prompt version', () => {
    expect(buildRunCountFilters(NOW)).toEqual({
      countedRowsFilter: 'status.neq.pending,created_at.gte."2026-10-06T13:40:00.000Z"',
      createdAtEnd: '2026-10-07T00:00:00.000Z',
      createdAtStart: '2026-10-06T00:00:00.000Z',
    });
  });

  it('lets counts that include the request itself reach a cap but not pass it', () => {
    expect(decideRateLimit({ global: 1, install: 1 }, LIMITS)).toEqual({ ok: true });
    expect(decideRateLimit({ global: 100, install: 3 }, LIMITS)).toEqual({ ok: true });
    expect(decideRateLimit({ global: 101, install: 1 }, LIMITS)).toEqual({
      ok: false,
      error: 'global_daily_limit_reached',
      status: 429,
    });
    expect(decideRateLimit({ global: 4, install: 4 }, LIMITS)).toEqual({
      ok: false,
      error: 'install_daily_limit_reached',
      status: 429,
    });
    expect(decideRateLimit({ global: 101, install: 4 }, LIMITS)).toMatchObject({
      error: 'global_daily_limit_reached',
    });
  });

  it('admits requests one after another up to the cap, then gives refused places back', async () => {
    const table = createRunsTable();
    const results = [];
    for (let index = 0; index < 5; index += 1) {
      results.push(await reserveRateLimitedRun(table.store(), RESERVATION));
    }

    expect(results.map((result) => result.ok)).toEqual([true, true, true, false, false]);
    expect(results[3]).toEqual({ ok: false, error: 'install_daily_limit_reached', status: 429 });
    expect(table.rows.size).toBe(3);
  });

  it('never admits more than the cap from a burst of parallel requests', async () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const table = createRunsTable();
      const delay = createRandomDelay(seed);
      const results = await Promise.all(
        Array.from({ length: 10 }, () => reserveRateLimitedRun(table.store(delay), RESERVATION))
      );
      const admitted = results.filter((result) => result.ok).length;

      expect(admitted).toBeLessThanOrEqual(LIMITS.perInstall);
      expect(table.rows.size).toBe(admitted);
    }
  });

  it('admits a whole burst when it fits under the cap', async () => {
    const table = createRunsTable();
    const delay = createRandomDelay(7);
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        reserveRateLimitedRun(table.store(delay), { ...RESERVATION, limits: { global: 100, perInstall: 50 } })
      )
    );

    expect(results.every((result) => result.ok)).toBe(true);
    expect(table.rows.size).toBe(10);
  });

  it('counts everyone and the install in parallel with the same filters', async () => {
    const counts: [unknown, string | undefined][] = [];
    await reserveRateLimitedRun(
      {
        insertPending: async () => true,
        count: async (filters, installIdHash) => {
          counts.push([filters, installIdHash]);
          return 1;
        },
        release: async () => {},
      },
      RESERVATION
    );

    expect(counts).toEqual([
      [buildRunCountFilters(NOW), undefined],
      [buildRunCountFilters(NOW), 'hash-1'],
    ]);
  });

  it('answers rate_limit_unavailable when the reservation or the counts fail', async () => {
    const calls: string[] = [];
    const store = (overrides: Partial<ReservationStore>): ReservationStore => ({
      insertPending: async () => true,
      count: async () => {
        calls.push('count');
        return 1;
      },
      release: async () => {
        calls.push('release');
      },
      ...overrides,
    });
    const unavailable = { ok: false, error: 'rate_limit_unavailable', status: 503 };

    expect(
      await reserveRateLimitedRun(store({ insertPending: async () => false }), RESERVATION)
    ).toEqual(unavailable);
    expect(calls).toEqual([]);

    expect(
      await reserveRateLimitedRun(
        store({ count: async (_filters, installIdHash) => (installIdHash ? null : 1) }),
        RESERVATION
      )
    ).toEqual(unavailable);
    expect(calls).toEqual(['release']);
  });
});
