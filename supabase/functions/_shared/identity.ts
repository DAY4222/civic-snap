// Who is calling, for the daily limits. No Deno or Supabase imports, so Jest can test it.
//
// The functions run with verify_jwt on, so the platform has already checked the signature of
// the Authorization token before this code runs: either the project's anon key (role "anon") or
// a signed-in user's token (role "authenticated"; anonymous users included). This module only
// reads the verified token. If verify_jwt were turned off, a caller could invent a user id; that
// would be no worse than today's install id, which the app makes up, but keep it on.

export type CallerIdentity =
  /** A Supabase Auth user, anonymous or not: one per app install that signed in. */
  | { kind: 'user'; key: string }
  /** The app's own install id, for builds or projects without anonymous sign-in. */
  | { kind: 'install'; key: string };

/** The user id in a verified bearer token, or null for the anon key and anything unreadable. */
export function readSignedInUserId(authorization: string | null | undefined): string | null {
  const token = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
  const payloadPart = token?.split('.')[1];
  if (!payloadPart) return null;

  try {
    const payload = JSON.parse(decodeBase64Url(payloadPart)) as Record<string, unknown>;
    if (payload.role !== 'authenticated') return null;
    return typeof payload.sub === 'string' && payload.sub ? payload.sub : null;
  } catch {
    return null;
  }
}

/** The signed-in user when there is one, otherwise the install id from the request body. */
export function resolveCallerIdentity(
  authorization: string | null | undefined,
  installId: string
): CallerIdentity {
  const userId = readSignedInUserId(authorization);
  return userId ? { kind: 'user', key: `user:${userId}` } : { kind: 'install', key: installId };
}

/**
 * REQUIRE_SIGNED_IN_USER=true turns away callers without a user token (401 sign_in_required).
 * Off by default, so app builds and projects without anonymous sign-in keep working.
 */
export function isSignedInUserRequired(getEnv: (name: string) => string | undefined) {
  return getEnv('REQUIRE_SIGNED_IN_USER')?.trim().toLowerCase() === 'true';
}

function decodeBase64Url(value: string) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  return new TextDecoder().decode(Uint8Array.from(atob(padded), (char) => char.charCodeAt(0)));
}
