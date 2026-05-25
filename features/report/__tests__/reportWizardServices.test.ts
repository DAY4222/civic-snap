import { ISSUE_CATEGORIES } from '@/lib/categories';
import { buildEmail } from '@/lib/email';
import type { DraftReportInput } from '@/lib/types';

import { buildPreviewEmail } from '../reportWizardServices';

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
});
