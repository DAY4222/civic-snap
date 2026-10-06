import { getDeviceItem, setDeviceItem } from '../deviceStore';
import { BackendError, postJson, type FetchImpl } from './client';
import { backendConfig } from './config';

/**
 * An anonymous Supabase Auth user for this install, so the AI functions can count one caller
 * per install instead of trusting an install id the app makes up. Nothing personal is sent: the
 * sign-in creates a random user id. It happens on the first AI request, which the user has
 * already opted into, never at launch.
 *
 * Every failure falls back to the project's anon key, which works exactly as before. That
 * includes projects where anonymous sign-ins are turned off (the default).
 */
export type UserTokenProvider = {
  /** A current access token, or null to use the anon key. Never throws. */
  getToken: () => Promise<string | null>;
  /** Drops the saved session, e.g. after the function rejected its token. */
  forget: () => Promise<void>;
};

type StoredSession = {
  accessToken: string;
  refreshToken: string;
  /** Seconds since the epoch, as Supabase Auth reports it. */
  expiresAt: number;
};

type ProviderOptions = {
  /** https://<project>.supabase.co/auth/v1 */
  authUrl: string;
  anonKey: string;
  fetchImpl?: FetchImpl;
  store?: { get: (key: string) => Promise<string | null>; set: (key: string, value: string) => Promise<void> };
  now?: () => number;
};

const SESSION_KEY = 'civic-snap-auth-session';
/** Refresh a little early so a token can't expire between here and the function. */
const REFRESH_MARGIN_SECONDS = 60;
const AUTH_TIMEOUT_MS = 8_000;
/** After a failed sign-in (offline, rate limited), don't retry on every request. */
const RETRY_AFTER_FAILURE_MS = 5 * 60 * 1000;

export function createUserTokenProvider(options: ProviderOptions): UserTokenProvider {
  const store = options.store ?? { get: getDeviceItem, set: setDeviceItem };
  const now = options.now ?? Date.now;
  // Anonymous sign-ins are off for the project: stop asking until the app restarts.
  let signInDisabled = false;
  let retryAfter = 0;
  let pending: Promise<string | null> | null = null;

  async function loadSession(): Promise<StoredSession | null> {
    try {
      const raw = await store.get(SESSION_KEY);
      if (!raw) return null;
      const value = JSON.parse(raw) as Partial<StoredSession>;
      return typeof value.accessToken === 'string' &&
        typeof value.refreshToken === 'string' &&
        typeof value.expiresAt === 'number'
        ? (value as StoredSession)
        : null;
    } catch {
      return null;
    }
  }

  async function saveSession(session: StoredSession | null) {
    await store.set(SESSION_KEY, session ? JSON.stringify(session) : '').catch(() => undefined);
  }

  async function callAuth(path: string, body: unknown): Promise<StoredSession | null> {
    const result = await postJson(`${options.authUrl}${path}`, body, {
      anonKey: options.anonKey,
      // Auth wants only the apikey; the anon key as bearer is what supabase-js sends too.
      fetchImpl: options.fetchImpl,
      timeoutMs: AUTH_TIMEOUT_MS,
    });
    return toSession(result, now());
  }

  async function signIn(): Promise<string | null> {
    if (signInDisabled || now() < retryAfter) return null;
    try {
      const session = await callAuth('/signup', {});
      if (!session) throw new BackendError('Sign-in returned no session.', 'invalid-response');
      await saveSession(session);
      return session.accessToken;
    } catch (error) {
      // 422 anonymous_provider_disabled: the project hasn't turned anonymous sign-ins on.
      if (error instanceof BackendError && error.status === 422) signInDisabled = true;
      else retryAfter = now() + RETRY_AFTER_FAILURE_MS;
      return null;
    }
  }

  async function resolveToken(): Promise<string | null> {
    if (!options.authUrl || !options.anonKey) return null;

    const session = await loadSession();
    if (session && session.expiresAt - REFRESH_MARGIN_SECONDS > now() / 1000) {
      return session.accessToken;
    }

    if (session) {
      try {
        const refreshed = await callAuth('/token?grant_type=refresh_token', {
          refresh_token: session.refreshToken,
        });
        if (refreshed) {
          await saveSession(refreshed);
          return refreshed.accessToken;
        }
      } catch (error) {
        // Only a refresh token Auth no longer accepts means starting over with a new user.
        // Offline, rate limited or down: keep the session for next time, use the anon key now.
        const status = error instanceof BackendError ? error.status : undefined;
        if (status == null || status < 400 || status > 403) return null;
      }
      await saveSession(null);
    }

    return signIn();
  }

  return {
    getToken: () => {
      // Parallel requests share one sign-in or refresh.
      pending ??= resolveToken()
        .catch(() => null)
        .finally(() => {
          pending = null;
        });
      return pending;
    },
    forget: () => saveSession(null),
  };
}

function toSession(result: unknown, nowMs: number): StoredSession | null {
  if (!result || typeof result !== 'object') return null;
  const body = result as Record<string, unknown>;
  const accessToken = typeof body.access_token === 'string' ? body.access_token : '';
  const refreshToken = typeof body.refresh_token === 'string' ? body.refresh_token : '';
  const expiresAt =
    typeof body.expires_at === 'number'
      ? body.expires_at
      : typeof body.expires_in === 'number'
        ? Math.floor(nowMs / 1000) + body.expires_in
        : 0;
  return accessToken && refreshToken && expiresAt ? { accessToken, refreshToken, expiresAt } : null;
}

/** https://<project>.supabase.co/auth/v1, from any of the project's function URLs. */
export function authUrlFromFunctionUrl(functionUrl: string) {
  try {
    return functionUrl ? `${new URL(functionUrl).origin}/auth/v1` : '';
  } catch {
    return '';
  }
}

export const appUserTokens = createUserTokenProvider({
  anonKey: backendConfig.anonKey,
  authUrl: authUrlFromFunctionUrl(backendConfig.analyzePhotoUrl || backendConfig.rewriteEmailUrl),
});

/** For callers that should only ever use the anon key (and for tests). */
export const ANON_KEY_ONLY: UserTokenProvider = {
  getToken: async () => null,
  forget: async () => undefined,
};

/**
 * POSTs to a function as the signed-in install when possible. A token the function rejects
 * (expired, revoked) is dropped and the request is sent once more with the anon key.
 */
export async function postAsCaller(
  url: string,
  body: unknown,
  options: Parameters<typeof postJson>[2] & { tokens?: UserTokenProvider }
) {
  const tokens = options.tokens ?? appUserTokens;
  const accessToken = await tokens.getToken();
  try {
    return await postJson(url, body, { ...options, accessToken });
  } catch (error) {
    if (accessToken && error instanceof BackendError && error.status === 401) {
      await tokens.forget();
      return postJson(url, body, { ...options, accessToken: null });
    }
    throw error;
  }
}
