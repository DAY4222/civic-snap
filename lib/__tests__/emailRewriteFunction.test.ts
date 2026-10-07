import {
  MAX_DEFAULT_EMAIL_CHARS,
  MAX_REWRITTEN_BODY_CHARS,
  REWRITE_GENERATION_CONFIG,
  buildGeminiEmailRewritePrompt,
  buildRewriteRunReservationRow,
  buildRewriteRunResultRow,
  normalizeGeminiEmailRewriteResult,
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
    expect(prompt).toContain('Never add causes, consequences, hazards');
    expect(prompt).toContain('Keep measurements, directions, counts, and place names exactly as written.');
    expect(prompt).toContain("stay close to the user's own wording");
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

  it('reads rewrite limits', () => {
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
  });

  it('builds metadata-only run rows', () => {
    const validation = validateEmailRewriteRequest({
      installId: 'install-1234567890abcdef',
      contactDetails: 'Ada Lovelace, 555-0100',
      defaultEmail: 'Hello 311 Toronto',
      guidedAnswers: ['Is this on a City road?: Road', 'Size: Large'],
      issueDescription: 'Large pothole in curb lane',
      promptVersion: 'client-v1',
    });
    if (!validation.ok) throw new Error('Expected a valid request');

    const reservation = buildRewriteRunReservationRow({
      model: 'gemini-3.1-flash-lite',
      promptVersion: 'toronto-311-email-rewrite-v3',
      provider: 'gemini',
      request: validation,
    });
    const result = buildRewriteRunResultRow({ latencyMs: 250, outputChars: 900, status: 'ok' });

    expect(reservation).toEqual({
      client_prompt_version: 'client-v1',
      default_email_chars: 17,
      guided_answer_count: 2,
      input_chars: validation.inputChars,
      model: 'gemini-3.1-flash-lite',
      prompt_version: 'toronto-311-email-rewrite-v3',
      provider: 'gemini',
    });
    expect(result).toEqual({
      error_code: null,
      error_message: null,
      latency_ms: 250,
      output_chars: 900,
      status: 'ok',
    });
    expect(
      buildRewriteRunResultRow({
        errorCode: 'gemini_request_failed',
        errorMessage: 'Gemini returned 429',
        latencyMs: 40,
        outputChars: 0,
        status: 'error',
      })
    ).toMatchObject({ error_code: 'gemini_request_failed', error_message: 'Gemini returned 429' });
  });
});

describe('rewrite generation settings', () => {
  it('pins minimal thinking and caps output well above the longest kept body', () => {
    expect(REWRITE_GENERATION_CONFIG.thinking_config.thinking_level).toBe('minimal');
    // About 4 characters per token: the cap must leave room for a full-length body in JSON.
    expect(REWRITE_GENERATION_CONFIG.max_output_tokens * 4).toBeGreaterThan(MAX_REWRITTEN_BODY_CHARS * 2);
  });
});
