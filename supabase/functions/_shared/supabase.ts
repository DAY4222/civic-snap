// The only supabase-js import. Pinned to an exact version so a new release can't change a
// function between deploys; bump it here deliberately.
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';

/** Uses the service-role key: the runs tables have row level security and no policies. */
export function createServiceClient(supabaseUrl: string, serviceRoleKey: string) {
  return createClient(supabaseUrl, serviceRoleKey);
}

export type ServiceClient = ReturnType<typeof createServiceClient>;
