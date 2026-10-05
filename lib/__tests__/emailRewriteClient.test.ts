import { ISSUE_CATEGORIES } from '../categories';
import { EMPTY_DRAFT } from '../reportDraft';
import { BackendError } from '../backend/client';
import type { BackendConfig } from '../backend/config';
import {
  DEFAULT_REWRITE_TIMEOUT_MS,
  canRewriteEmailDraft,
  normalizeEmailRewriteResponse,
  rewriteEmailDraft,
} from '../emailRewriteClient';
import type { EmailInput } from '../types';

const baseInput: EmailInput = {
  ...EMPTY_DRAFT,
  category: ISSUE_CATEGORIES[0],
  description: 'Damaged residential bin lid',
  answers: {
    a0K6g000009yWvaEAE: 'Request Repairs for a Damaged Bin',
    a0K6g000009yWvfEAE: 'Lid',
  },
  address: '123 Queen St W',
  locationNote: 'north curb',
  latitude: 43.653481,
  longitude: -79.383935,
  photoUri: null,
  profile: {
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    phone: '555-0100',
  },
};

const config: BackendConfig = {
  anonKey: 'anon-key',
  analyzePhotoUrl: '',
  rewriteEmailUrl: 'https://example.supabase.co/functions/v1/rewrite-email',
  photoLabelsEnabled: false,
  emailRewriteEnabled: true,
};

describe('email rewrite client', () => {
  it('detects whether rewriting is configured', () => {
    expect(DEFAULT_REWRITE_TIMEOUT_MS).toBe(25_000);
    expect(canRewriteEmailDraft(config)).toBe(true);
    expect(canRewriteEmailDraft({ ...config, rewriteEmailUrl: '' })).toBe(false);
    expect(canRewriteEmailDraft({ ...config, anonKey: '' })).toBe(false);
    expect(canRewriteEmailDraft({ ...config, emailRewriteEnabled: false })).toBe(false);
  });

  it('posts structured report context and normalizes a successful rewrite', async () => {
    let requestUrl = '';
    let requestInit: RequestInit | undefined;
    const fetchImpl = async (url: RequestInfo | URL, init?: RequestInit) => {
      requestUrl = String(url);
      requestInit = init;
      return new Response(
        JSON.stringify({
          body: 'Improved email body',
          provider: 'gemini',
          model: 'gemini-3.1-flash-lite',
          promptVersion: 'toronto-311-email-rewrite-v2',
          rewrittenAt: '2026-05-25T00:00:00.000Z',
          latencyMs: 123,
        })
      );
    };

    const result = await rewriteEmailDraft(baseInput, {
      config,
      defaultEmailBody: 'Prebuilt local draft body',
      fetchImpl,
      installId: 'install-1',
    });

    expect(result.body).toBe('Improved email body');
    expect(requestUrl).toBe(config.rewriteEmailUrl);
    expect(requestInit?.method).toBe('POST');
    expect(requestInit?.headers).toMatchObject({
      Authorization: 'Bearer anon-key',
      apikey: 'anon-key',
    });
    expect(JSON.parse(String(requestInit?.body))).toMatchObject({
      contactDetails: '',
      defaultEmail: 'Prebuilt local draft body',
      guidedAnswers: [
        'What is this request about?: Request Repairs for a Damaged Bin',
        'What part is damaged?: Lid',
      ],
      installId: 'install-1',
      issueLabel: 'Residential Bin Lid Damaged',
      promptVersion: 'toronto-311-email-rewrite-v2',
    });
  });

  it('maps unavailable rewrite states to typed errors', async () => {
    await expect(
      rewriteEmailDraft(baseInput, {
        config: { ...config, rewriteEmailUrl: '' },
        installId: 'install-1',
      })
    ).rejects.toMatchObject({ code: 'disabled' });

    await expect(
      rewriteEmailDraft(baseInput, {
        config,
        fetchImpl: async () => new Response('{}', { status: 429 }),
        installId: 'install-1',
      })
    ).rejects.toMatchObject({ code: 'rate-limited' });

    await expect(
      rewriteEmailDraft(baseInput, {
        config,
        fetchImpl: async () => new Response('{}', { status: 503 }),
        installId: 'install-1',
      })
    ).rejects.toMatchObject({ code: 'offline' });

    await expect(
      rewriteEmailDraft(baseInput, {
        config,
        fetchImpl: async () => new Response('{}', { status: 502 }),
        installId: 'install-1',
      })
    ).rejects.toMatchObject({ code: 'server' });

    await expect(
      rewriteEmailDraft(baseInput, {
        config,
        fetchImpl: async () => {
          throw new TypeError('Network request failed');
        },
        installId: 'install-1',
      })
    ).rejects.toMatchObject({ code: 'offline' });
  });

  it('rejects invalid response bodies', () => {
    expect(normalizeEmailRewriteResponse({ body: '  Improved body  ' })).toMatchObject({
      body: 'Improved body',
      provider: 'gemini',
    });
    expect(normalizeEmailRewriteResponse({ body: '' })).toBeNull();
    expect(normalizeEmailRewriteResponse(null)).toBeNull();
    expect(new BackendError('x', 'timeout').code).toBe('timeout');
  });
});
