import {
  MAX_DEFAULT_EMAIL_CHARS,
  buildGeminiEmailRewritePrompt,
  buildRewriteRunCountFilters,
  buildRewriteRunLogRow,
  normalizeGeminiEmailRewriteResult,
  parseJsonText,
  readRewriteLimitConfigFromEnv,
  validateEmailRewriteRequest,
} from '../../supabase/functions/rewrite-email/logic';

describe('rewrite-email Edge Function logic', () => {
  it('validates required request fields', () => {
    expect(validateEmailRewriteRequest({ defaultEmail: 'Hello' })).toEqual({
      ok: false,
      error: 'missing_install_id',
    });
    expect(validateEmailRewriteRequest({ installId: 'install-1' })).toEqual({
      ok: false,
      error: 'invalid_install_id',
    });
    expect(validateEmailRewriteRequest({ installId: 'install-1234567890abcdef' })).toEqual({
      ok: false,
      error: 'missing_default_email',
    });
  });

  it('normalizes and truncates request context for Gemini', () => {
    const validation = validateEmailRewriteRequest({
      installId: ' install-1234567890abcdef ',
      defaultEmail: 'A'.repeat(MAX_DEFAULT_EMAIL_CHARS + 10),
      guidedAnswers: ['  First answer  ', '', 'Second answer'],
      issueDescription: 'Damaged bin lid',
      issueLabel: 'Residential Bin Lid Damaged',
      location: '123 Queen St W',
      promptVersion: 'client-v1',
    });

    expect(validation.ok).toBe(true);
    if (!validation.ok) return;

    expect(validation.installId).toBe('install-1234567890abcdef');
    expect(validation.defaultEmail).toHaveLength(MAX_DEFAULT_EMAIL_CHARS);
    expect(validation.guidedAnswers).toEqual(['First answer', 'Second answer']);
    expect(validation.clientPromptVersion).toBe('client-v1');
    expect(validation.inputChars).toBeGreaterThan(MAX_DEFAULT_EMAIL_CHARS);
  });

  it('builds a server-owned Gemini prompt with output guardrails', () => {
    const validation = validateEmailRewriteRequest({
      installId: 'install-1234567890abcdef',
      defaultEmail: 'Hello 311 Toronto,\n\nIssue:\nRoad Pothole / Road Damage',
      guidedAnswers: ['Is this on a City road?: Road'],
      issueDescription: 'Large pothole in curb lane',
      issueLabel: 'Road Pothole / Road Damage',
      location: '123 Queen St W',
    });

    expect(validation.ok).toBe(true);
    if (!validation.ok) return;

    const prompt = buildGeminiEmailRewritePrompt(validation);
    expect(prompt).toContain('Return JSON only with this shape');
    expect(prompt).toContain('Use plain-text section labels with blank lines');
    expect(prompt).toContain('Do not invent dates, durations, hazards');
    expect(prompt).toContain('"issueLabel":"Road Pothole / Road Damage"');
    expect(prompt).toContain('"guidedAnswers":["Is this on a City road?: Road"]');
  });

  it('normalizes Gemini JSON output', () => {
    expect(
      normalizeGeminiEmailRewriteResult({
        body: '  Paragraph one.\n\n\nParagraph two.  ',
      })
    ).toEqual({
      body: 'Paragraph one.\n\nParagraph two.',
      outputChars: 30,
    });
    expect(normalizeGeminiEmailRewriteResult({ body: '' })).toBeNull();
  });

  it('reads rewrite limits and parses fenced JSON', () => {
    expect(
      readRewriteLimitConfigFromEnv((name) =>
        name === 'MAX_EMAIL_REWRITES_PER_INSTALL_PER_DAY' ? '12' : undefined
      )
    ).toEqual({
      ok: true,
      config: {
        maxRewritesGlobalPerDay: 300,
        maxRewritesPerInstallPerDay: 12,
      },
    });
    expect(readRewriteLimitConfigFromEnv(() => '0')).toEqual({ ok: false });
    expect(parseJsonText('```json\n{"body":"ok"}\n```')).toEqual({ body: 'ok' });
  });

  it('builds provider-scoped rate-limit filters', () => {
    const filters = buildRewriteRunCountFilters({
      endOfDay: new Date('2026-05-26T00:00:00.000Z'),
      installIdHash: 'hash-1',
      model: 'gemini-3.1-flash-lite',
      promptVersion: 'toronto-311-email-rewrite-v2',
      provider: 'gemini',
      startOfDay: new Date('2026-05-25T00:00:00.000Z'),
    });

    expect(filters).toEqual({
      createdAtEnd: '2026-05-26T00:00:00.000Z',
      createdAtStart: '2026-05-25T00:00:00.000Z',
      installIdHash: 'hash-1',
      model: 'gemini-3.1-flash-lite',
      promptVersion: 'toronto-311-email-rewrite-v2',
      provider: 'gemini',
    });
  });

  it('builds metadata-only diagnostic rows', () => {
    const row = buildRewriteRunLogRow({
      clientPromptVersion: 'client-v1',
      defaultEmailChars: 1200,
      guidedAnswerCount: 2,
      inputChars: 1500,
      installIdHash: 'hash-1',
      latencyMs: 250,
      model: 'gemini-3.1-flash-lite',
      outputChars: 900,
      promptVersion: 'toronto-311-email-rewrite-v2',
      provider: 'gemini',
      status: 'ok',
    });

    expect(row).toMatchObject({
      client_prompt_version: 'client-v1',
      default_email_chars: 1200,
      install_id_hash: 'hash-1',
      output_chars: 900,
      prompt_version: 'toronto-311-email-rewrite-v2',
      status: 'ok',
    });
    expect(Object.keys(row)).not.toEqual(
      expect.arrayContaining(['default_email', 'body', 'contact_details'])
    );
  });
});
