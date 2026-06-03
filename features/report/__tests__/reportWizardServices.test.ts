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
import type { DraftReportInput } from '@/lib/types';

import { buildPreviewEmail, saveReportDraft } from '../reportWizardServices';
import { createInitialReportWizardState } from '../reportWizardState';

const baseInput: DraftReportInput = {
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
    const buildLocalEmail = jest.fn((input: DraftReportInput) => buildEmail(input));
    const rewriteDraft = jest.fn(async () => ({
      body: 'Improved 311 email body',
    }));
    const email = await buildPreviewEmail(baseInput, rewriteDraft, buildLocalEmail);

    expect(buildLocalEmail).toHaveBeenCalledTimes(1);
    expect(rewriteDraft).toHaveBeenCalledWith(baseInput, {
      defaultEmailBody: expect.stringContaining('Hello 311 Toronto,'),
    });
    expect(email.subject).toBe('311 service request: Residential Bin Lid Damaged');
    expect(email.body).toBe('Improved 311 email body');
  });

  it('falls back to the deterministic local draft when rewriting fails', async () => {
    const localEmail = buildEmail(baseInput);
    const email = await buildPreviewEmail(baseInput, async () => {
      throw new Error('rewrite unavailable');
    });

    expect(email).toEqual(localEmail);
  });

  it('creates the local draft before applying an optional rewritten body', async () => {
    const state = {
      ...createInitialReportWizardState(),
      address: baseInput.address,
      answers: baseInput.answers,
      description: baseInput.description,
      latitude: baseInput.latitude,
      locationNote: baseInput.locationNote,
      longitude: baseInput.longitude,
      profile: baseInput.profile,
    };

    const result = await saveReportDraft({
      category: baseInput.category,
      savedReportId: null,
      state,
    });

    expect(mockCreateDraftReport).toHaveBeenCalledWith(
      expect.objectContaining({
        emailBody: expect.stringContaining('Hello 311 Toronto,'),
      })
    );
    expect(mockUpdateDraftReport).toHaveBeenCalledWith(
      'report-1',
      expect.objectContaining({
        emailBody: 'Improved 311 email body',
      })
    );
    expect(result).toMatchObject({
      email: { body: 'Improved 311 email body' },
      id: 'report-1',
    });
  });
});
