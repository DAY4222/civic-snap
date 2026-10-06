jest.mock('../deviceStore', () => ({
  getDeviceItem: jest.fn(async () => null),
  setDeviceItem: jest.fn(async () => undefined),
}));

import {
  authUrlFromFunctionUrl,
  createUserTokenProvider,
  postAsCaller,
  type UserTokenProvider,
} from '../backend/userToken';

const AUTH_URL = 'https://project.supabase.co/auth/v1';
const NOW_MS = Date.UTC(2026, 9, 6, 12, 0, 0);
const NOW_S = NOW_MS / 1000;

function sessionBody(accessToken: string, expiresAt = NOW_S + 3600) {
  return { access_token: accessToken, refresh_token: `refresh-${accessToken}`, expires_at: expiresAt };
}

function setup(responses: Record<string, () => Response | Promise<Response>>, now = () => NOW_MS) {
  const saved = new Map<string, string>();
  const calls: { url: string; body: unknown }[] = [];
  const fetchImpl = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const path = url.replace(AUTH_URL, '');
    const respond = responses[path];
    if (!respond) throw new Error(`unexpected request ${path}`);
    return respond();
  });
  const provider = createUserTokenProvider({
    anonKey: 'anon-key',
    authUrl: AUTH_URL,
    fetchImpl,
    now,
    store: {
      get: async (key) => saved.get(key) ?? null,
      set: async (key, value) => {
        saved.set(key, value);
      },
    },
  });
  return { calls, provider, saved };
}

const json = (status: number, body: unknown) => () =>
  new Response(JSON.stringify(body), { status });

describe('anonymous user tokens', () => {
  it('signs in once, then reuses the saved token', async () => {
    const { calls, provider } = setup({ '/signup': json(200, sessionBody('token-1')) });

    await expect(provider.getToken()).resolves.toBe('token-1');
    await expect(provider.getToken()).resolves.toBe('token-1');
    expect(calls.map((call) => call.url)).toEqual([`${AUTH_URL}/signup`]);
  });

  it('shares one sign-in between parallel requests', async () => {
    const { calls, provider } = setup({ '/signup': json(200, sessionBody('token-1')) });

    const tokens = await Promise.all([provider.getToken(), provider.getToken(), provider.getToken()]);
    expect(tokens).toEqual(['token-1', 'token-1', 'token-1']);
    expect(calls).toHaveLength(1);
  });

  it('refreshes a token that is about to expire', async () => {
    let now = NOW_MS;
    const { calls, provider } = setup(
      {
        '/signup': json(200, sessionBody('token-1', NOW_S + 3600)),
        '/token?grant_type=refresh_token': json(200, sessionBody('token-2')),
      },
      () => now
    );

    await provider.getToken();
    now = NOW_MS + 3570 * 1000; // 30 s before expiry
    await expect(provider.getToken()).resolves.toBe('token-2');
    expect(calls[1]).toEqual({
      url: `${AUTH_URL}/token?grant_type=refresh_token`,
      body: { refresh_token: 'refresh-token-1' },
    });
  });

  it('starts over when Auth no longer accepts the refresh token', async () => {
    let now = NOW_MS;
    let signups = 0;
    const { provider } = setup(
      {
        '/signup': () => {
          signups += 1;
          return json(200, sessionBody(`token-${signups}`))();
        },
        '/token?grant_type=refresh_token': json(400, { error_code: 'refresh_token_not_found' }),
      },
      () => now
    );

    await provider.getToken();
    now = NOW_MS + 4000 * 1000;
    await expect(provider.getToken()).resolves.toBe('token-2');
  });

  it('keeps the session but uses the anon key while Auth is unreachable', async () => {
    let now = NOW_MS;
    let online = true;
    const { provider, saved } = setup(
      {
        '/signup': json(200, sessionBody('token-1')),
        '/token?grant_type=refresh_token': () => {
          if (!online) throw new TypeError('Network request failed');
          return json(200, sessionBody('token-2'))();
        },
      },
      () => now
    );

    await provider.getToken();
    now = NOW_MS + 4000 * 1000;
    online = false;
    await expect(provider.getToken()).resolves.toBeNull();
    expect(saved.get('civic-snap-auth-session')).toContain('token-1');

    online = true;
    await expect(provider.getToken()).resolves.toBe('token-2');
  });

  it('stops asking when the project has anonymous sign-ins turned off', async () => {
    const { calls, provider } = setup({
      '/signup': json(422, { code: 422, error_code: 'anonymous_provider_disabled' }),
    });

    await expect(provider.getToken()).resolves.toBeNull();
    await expect(provider.getToken()).resolves.toBeNull();
    expect(calls).toHaveLength(1);
  });

  it('waits a while before retrying a failed sign-in', async () => {
    let now = NOW_MS;
    let attempts = 0;
    const { provider } = setup(
      {
        '/signup': () => {
          attempts += 1;
          return attempts === 1 ? json(429, {})() : json(200, sessionBody('token-1'))();
        },
      },
      () => now
    );

    await expect(provider.getToken()).resolves.toBeNull();
    await expect(provider.getToken()).resolves.toBeNull();
    expect(attempts).toBe(1);

    now = NOW_MS + 6 * 60 * 1000;
    await expect(provider.getToken()).resolves.toBe('token-1');
  });

  it('derives the Auth URL from a function URL', () => {
    expect(
      authUrlFromFunctionUrl('https://abc.supabase.co/functions/v1/analyze-photo-labels')
    ).toBe('https://abc.supabase.co/auth/v1');
    expect(authUrlFromFunctionUrl('')).toBe('');
    expect(authUrlFromFunctionUrl('not a url')).toBe('');
  });
});

describe('postAsCaller', () => {
  function tokens(token: string | null): UserTokenProvider & { forgotten: number } {
    const provider = {
      forgotten: 0,
      getToken: async () => token,
      forget: async () => {
        provider.forgotten += 1;
      },
    };
    return provider;
  }

  it('sends the user token as the bearer, and the anon key as apikey', async () => {
    let headers: HeadersInit | undefined;
    await postAsCaller(
      'https://abc.supabase.co/functions/v1/fn',
      {},
      {
        anonKey: 'anon-key',
        fetchImpl: async (_url, init) => {
          headers = init?.headers;
          return new Response('{}');
        },
        timeoutMs: 1000,
        tokens: tokens('user-token'),
      }
    );
    expect(headers).toMatchObject({ Authorization: 'Bearer user-token', apikey: 'anon-key' });
  });

  it('drops a rejected token and retries once with the anon key', async () => {
    const provider = tokens('expired-token');
    const bearers: string[] = [];
    const result = await postAsCaller(
      'https://abc.supabase.co/functions/v1/fn',
      {},
      {
        anonKey: 'anon-key',
        fetchImpl: async (_url, init) => {
          const bearer = (init?.headers as Record<string, string>).Authorization;
          bearers.push(bearer);
          return bearer === 'Bearer expired-token'
            ? new Response('{}', { status: 401 })
            : new Response('{"ok":true}');
        },
        timeoutMs: 1000,
        tokens: provider,
      }
    );
    expect(result).toEqual({ ok: true });
    expect(bearers).toEqual(['Bearer expired-token', 'Bearer anon-key']);
    expect(provider.forgotten).toBe(1);
  });
});
