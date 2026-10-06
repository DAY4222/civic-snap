import {
  reserveRateLimitedRun,
  type DailyLimits,
  type RateLimitResult,
  type RunCountFilters,
} from './rateLimit.ts';
import type { ServiceClient } from './supabase.ts';

/** One row per model call: diagnostics, and the counts behind the daily limits. */
export type RunsTable = 'ai_photo_analysis_runs' | 'ai_email_rewrite_runs';

export type RunReservation = { ok: true; runId: string } | Extract<RateLimitResult, { ok: false }>;

/**
 * Inserts this request's row as 'pending' and checks the daily limits with it counted. When a
 * limit is reached or the limits can't be checked, the row is deleted and the result says why.
 */
export async function reserveRun(
  supabase: ServiceClient,
  table: RunsTable,
  input: {
    installIdHash: string;
    limits: DailyLimits;
    now: Date;
    /** The function's metadata columns. Never request content. */
    row: Record<string, unknown>;
  }
): Promise<RunReservation> {
  const runId = crypto.randomUUID();
  const result = await reserveRateLimitedRun(
    {
      insertPending: async () => {
        const { error } = await supabase.from(table).insert({
          ...input.row,
          created_at: input.now.toISOString(),
          id: runId,
          install_id_hash: input.installIdHash,
          status: 'pending',
        });
        if (error) console.error(`Failed to reserve a ${table} row`, error);
        return !error;
      },
      count: (filters, installIdHash) => countRuns(supabase, table, filters, installIdHash),
      release: async () => {
        const { error } = await supabase.from(table).delete().eq('id', runId);
        // A row that can't be deleted stops counting once it is stale.
        if (error) console.error(`Failed to release a ${table} reservation`, error);
      },
    },
    input
  );

  return result.ok ? { ok: true, runId } : result;
}

/** Records how the call ended on the row reserved for it. */
export async function finishRun(
  supabase: ServiceClient,
  table: RunsTable,
  runId: string,
  result: Record<string, unknown>
) {
  const { error } = await supabase.from(table).update(result).eq('id', runId);
  if (error) {
    console.error(`Failed to record a ${table} result`, error);
  }
}

async function countRuns(
  supabase: ServiceClient,
  table: RunsTable,
  filters: RunCountFilters,
  installIdHash?: string
) {
  let query = supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .gte('created_at', filters.createdAtStart)
    .lt('created_at', filters.createdAtEnd)
    .or(filters.countedRowsFilter);

  if (installIdHash) {
    query = query.eq('install_id_hash', installIdHash);
  }

  const { count, error } = await query;
  if (error) {
    console.error(`Failed to count ${table} rows`, error);
    return null;
  }

  return count ?? 0;
}
