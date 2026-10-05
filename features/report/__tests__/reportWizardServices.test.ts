const mockCreateDraftReport = jest.fn();
const mockUpdateDraftReport = jest.fn();
const mockUpdateReportEmail = jest.fn();
const mockUpdateReportStatus = jest.fn();
const mockRewriteEmailDraft = jest.fn();

jest.mock('@/lib/reports', () => ({
  createDraftReport: (...args: unknown[]) => mockCreateDraftReport(...args),
  updateDraftReport: (...args: unknown[]) => mockUpdateDraftReport(...args),
  updateReportEmail: (...args: unknown[]) => mockUpdateReportEmail(...args),
  updateReportStatus: (...args: unknown[]) => mockUpdateReportStatus(...args),
}));

jest.mock('@/lib/emailRewriteClient', () => {
  const actual = jest.requireActual('@/lib/emailRewriteClient');
  return {
    ...actual,
    canRewriteEmailDraft: () => true,
    rewriteEmailDraft: (...args: unknown[]) => mockRewriteEmailDraft(...args),
  };
});

import { ISSUE_CATEGORIES } from '@/lib/categories';
import { buildEmail } from '@/lib/email';
import { EMPTY_DRAFT } from '@/lib/reportDraft';
import type { EmailInput } from '@/lib/types';

import { buildPreviewEmail, toCreateReportInput } from '../reportWizardServices';

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
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateDraftReport.mockResolvedValue('report-1');
    mockUpdateDraftReport.mockResolvedValue(undefined);
    mockUpdateReportEmail.mockResolvedValue(undefined);
    mockUpdateReportStatus.mockResolvedValue(undefined);
    mockRewriteEmailDraft.mockResolvedValue({
      body: 'Improved 311 email body',
    });
  });

  it('uses the rewritten body while preserving the local subject', async () => {
    const buildLocalEmail = jest.fn((input: EmailInput) => buildEmail(input));
    const rewriteDraft = jest.fn(async () => ({
      body: 'Improved 311 email body',
    }));
    const email = await buildPreviewEmail(baseInput, rewriteDraft, buildLocalEmail);

    expect(buildLocalEmail).toHaveBeenCalledTimes(1);
    expect(rewriteDraft).toHaveBeenCalledWith(baseInput, {
      defaultEmailBody: expect.stringContaining('Hello 311 Toronto,'),
    });
    const sentDraft = (rewriteDraft.mock.calls[0] as unknown[])[1] as { defaultEmailBody: string };
    expect(sentDraft.defaultEmailBody).not.toContain('Ada Lovelace');
    expect(sentDraft.defaultEmailBody).not.toContain('GPS:');
    expect(email.subject).toBe('311 service request: Residential Bin Lid Damaged');
    expect(email.body).toContain('Improved 311 email body');
    expect(email.body).toContain('GPS: 43.653481, -79.383935');
    expect(email.body).toContain('Contact:\nName: Ada Lovelace\nPhone: 555-0100');
  });

  it('falls back to the deterministic local draft when rewriting fails', async () => {
    const localEmail = buildEmail(baseInput);
    const email = await buildPreviewEmail(baseInput, async () => {
      throw new Error('rewrite unavailable');
    });

    expect(email).toEqual(localEmail);
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
      toCreateReportInput(draft, { ...baseInput.category, id: 'general', title: 'General 311 report' }, {
        subject: 'Subject',
        body: 'Body',
        source: 'generated',
      }).categoryId
    ).toBeNull();
  });
});
