import { ISSUE_CATEGORIES } from '@/lib/categories';
import { EMPTY_DRAFT } from '@/lib/reportDraft';
import type { EmailInput } from '@/lib/types';

import { requestPolishedEmail, toCreateReportInput } from '../reportWizardServices';

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
    email: '',
    phone: '555-0100',
  },
};

describe('report wizard services', () => {
  it('polishes from a privacy-safe draft and adds contact details back locally', async () => {
    const rewriteDraft = jest.fn(async () => ({ body: 'Improved 311 email body' }));

    const email = await requestPolishedEmail(baseInput, {}, rewriteDraft);

    const options = (rewriteDraft.mock.calls[0] as unknown[])[1] as {
      defaultEmailBody: string;
      timeoutMs: number;
    };
    expect(options.defaultEmailBody).toContain('Hello 311 Toronto,');
    expect(options.defaultEmailBody).not.toContain('Ada Lovelace');
    expect(options.defaultEmailBody).not.toContain('GPS:');
    expect(options.timeoutMs).toBeGreaterThan(20_000);
    expect(email.subject).toBe('311 service request: Residential Bin Lid Damaged');
    expect(email.body).toContain('Improved 311 email body');
    expect(email.body).toContain('GPS: 43.653481, -79.383935');
    expect(email.body).toContain('Contact:\nName: Ada Lovelace\nPhone: 555-0100');
  });

  it('passes cancellation through to the request', async () => {
    const controller = new AbortController();
    const rewriteDraft = jest.fn(async () => ({ body: 'Improved' }));

    await requestPolishedEmail(baseInput, { signal: controller.signal }, rewriteDraft);

    expect((rewriteDraft.mock.calls[0] as unknown[])[1]).toMatchObject({
      signal: controller.signal,
    });
  });

  it('lets polish failures reach the caller so the preview can explain them', async () => {
    await expect(
      requestPolishedEmail(baseInput, {}, async () => {
        throw new Error('rewrite unavailable');
      })
    ).rejects.toThrow('rewrite unavailable');
  });

  it('saves the whole draft with its issue title and current email', () => {
    const { category, profile: _profile, ...draft } = baseInput;

    const input = toCreateReportInput(draft, category, {
      subject: 'Subject',
      body: 'Body',
      source: 'user',
    });

    expect(input).toMatchObject({
      categoryId: category.id,
      category: 'Residential Bin Lid Damaged',
      locationNote: 'north curb',
      emailSubject: 'Subject',
      emailBody: 'Body',
      emailSource: 'user',
    });
  });

  it('saves a general report without a category id', () => {
    const { profile: _profile, category: _category, ...draft } = baseInput;

    expect(
      toCreateReportInput(
        draft,
        { ...baseInput.category, id: 'general', title: 'General 311 report' },
        { subject: 'Subject', body: 'Body', source: 'generated' }
      ).categoryId
    ).toBeNull();
  });
});
