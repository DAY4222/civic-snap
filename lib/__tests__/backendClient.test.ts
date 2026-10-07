import { postJson } from '../backend/client';
import { isEmailPolishConfigured, isPhotoAnalysisConfigured } from '../backend/config';

const options = { anonKey: 'anon-key', timeoutMs: 1_000 };

describe('backend client', () => {
  it('posts JSON with the anon key and returns the parsed body', async () => {
    let init: RequestInit | undefined;
    const result = await postJson(
      'https://example.test/fn',
      { hello: 'world' },
      {
        ...options,
        fetchImpl: async (_url, requestInit) => {
          init = requestInit;
          return new Response('{"ok":true}');
        },
      }
    );

    expect(result).toEqual({ ok: true });
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer anon-key', apikey: 'anon-key' });
    expect(JSON.parse(String(init?.body))).toEqual({ hello: 'world' });
  });

  it.each([
    [429, 'rate-limited'],
    [503, 'offline'],
    [500, 'server'],
  ])('maps HTTP %s to %s', async (status, code) => {
    await expect(
      postJson('https://example.test/fn', {}, {
        ...options,
        fetchImpl: async () => new Response('{}', { status }),
      })
    ).rejects.toMatchObject({ code });
  });

  it('separates offline, timeout and cancelled requests', async () => {
    await expect(
      postJson('https://example.test/fn', {}, {
        ...options,
        fetchImpl: async () => {
          throw new TypeError('Network request failed');
        },
      })
    ).rejects.toMatchObject({ code: 'offline' });

    const hangUntilAborted = (_url: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });

    await expect(
      postJson('https://example.test/fn', {}, { ...options, timeoutMs: 10, fetchImpl: hangUntilAborted })
    ).rejects.toMatchObject({ code: 'timeout' });

    const controller = new AbortController();
    const cancelled = postJson('https://example.test/fn', {}, {
      ...options,
      fetchImpl: hangUntilAborted,
      signal: controller.signal,
    });
    controller.abort();
    await expect(cancelled).rejects.toMatchObject({ code: 'cancelled' });
  });

  it('reports invalid JSON instead of throwing a parse error', async () => {
    await expect(
      postJson('https://example.test/fn', {}, {
        ...options,
        fetchImpl: async () => new Response('not json'),
      })
    ).rejects.toMatchObject({ code: 'invalid-response' });
  });

  it('only enables each feature when its flag, URL and key are present', () => {
    const config = {
      anonKey: 'anon-key',
      analyzePhotoUrl: 'https://example.test/analyze',
      rewriteEmailUrl: 'https://example.test/rewrite',
      photoLabelsEnabled: true,
      emailRewriteEnabled: true,
    };

    expect(isPhotoAnalysisConfigured(config)).toBe(true);
    expect(isEmailPolishConfigured(config)).toBe(true);
    expect(isPhotoAnalysisConfigured({ ...config, photoLabelsEnabled: false })).toBe(false);
    expect(isEmailPolishConfigured({ ...config, emailRewriteEnabled: false })).toBe(false);
    expect(isEmailPolishConfigured({ ...config, anonKey: '' })).toBe(false);
  });
});
