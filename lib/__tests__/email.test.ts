import { ISSUE_CATEGORIES } from '../categories';
import { EMPTY_DRAFT } from '../reportDraft';
import { addLocalDetailsToRewrittenBody, buildEmail } from '../email';
import type { EmailInput, IssueCategory, PhotoIssueCandidate } from '../types';

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
  photoUri: 'file:///report-photo.jpg',
  profile: {
    name: ' Ada Lovelace ',
    email: '',
    phone: ' 555-0100 ',
  },
};

const photoIssueTopic: PhotoIssueCandidate = {
  issueId: 'road-pothole-road-damage',
  title: 'Road Pothole / Road Damage',
  confidence: 0.91,
  confidenceTier: 'strong',
  supportingLabelIds: ['road-pothole'],
  evidenceChips: ['Road pothole'],
  reason: 'The photo shows a road pothole.',
  suggestedDescription: 'Photo shows a road pothole at this location.',
  boundingBoxes: [],
};

describe('buildEmail', () => {
  it('builds a Toronto 311 draft with report details and trimmed contact info', () => {
    const email = buildEmail(baseInput);

    expect(email.recipient).toBe('311@toronto.ca');
    expect(email.subject).toBe('311 service request: Residential Bin Lid Damaged');
    expect(email.body).toContain('Location:\n123 Queen St W');
    expect(email.body).toContain('Location note: north curb');
    expect(email.body).toContain('GPS: 43.653481, -79.383935');
    expect(email.body).toContain('Issue:\nResidential Bin Lid Damaged');
    expect(email.body).toContain(
      'Category path: Waste Collection, Bins, Litter and Needle Cleanup > Residential > Collection Bin > Residential Bin Lid Damaged'
    );
    expect(email.body).toContain('- What is this request about?: Request Repairs for a Damaged Bin');
    expect(email.body).toContain('- What part is damaged?: Lid');
    expect(email.body).toContain('- Photo attached');
    expect(email.body).toContain('Name: Ada Lovelace');
    expect(email.body).toContain('Phone: 555-0100');
    expect(email.body).not.toContain('Email:');
  });

  it('keeps optional sections out when report data is absent', () => {
    const generalCategory: IssueCategory = {
      id: 'general',
      title: 'General 311 report',
      subjectLabel: 'local issue',
      categoryPath: [],
      description: '',
      discoverability: 'not-discoverable',
      visualCueLabelIds: [],
      requiredAnyLabelIds: [],
      requiredAllLabelIds: [],
      observations: [],
      questions: [],
      emailGuidanceChecklist: [],
    };

    const email = buildEmail({
      ...baseInput,
      category: generalCategory,
      answers: {},
      locationNote: '',
      latitude: null,
      longitude: null,
      photoUri: null,
      profile: {
        name: '',
        email: '',
        phone: '',
      },
    });

    expect(email.subject).toBe('311 service request: General 311 report');
    expect(email.body).toContain('GPS: not available');
    expect(email.body).toContain('- No photo attached');
    expect(email.body).not.toContain('Contact:');
  });

  it('keeps manual issue type as the email subject when photo topic guidance is present', () => {
    const email = buildEmail({
      ...baseInput,
      photoIssueTopic,
    });

    expect(email.subject).toBe('311 service request: Residential Bin Lid Damaged');
    expect(email.body).toContain('Photo evidence: Road pothole');
  });

  it('builds a privacy-safe draft for AI rewriting without contact details or GPS', () => {
    const email = buildEmail(baseInput, { includeContact: false, includeCoordinates: false });

    expect(email.body).not.toContain('Ada Lovelace');
    expect(email.body).not.toContain('555-0100');
    expect(email.body).not.toContain('GPS:');
    expect(email.body).toContain('Location note: north curb');
  });

  it('adds GPS and contact details back to a rewritten body before the sign-off', () => {
    const body = addLocalDetailsToRewrittenBody(
      'Issue: Damaged bin lid\n\nRequest: Please repair it.\n\nThank you.',
      baseInput
    );

    expect(body).toBe(
      [
        'Issue: Damaged bin lid',
        '',
        'Request: Please repair it.',
        '',
        'GPS: 43.653481, -79.383935',
        '',
        'Contact:',
        'Name: Ada Lovelace',
        'Phone: 555-0100',
        '',
        'Thank you.',
      ].join('\n')
    );
  });

  it('moves a thank-you that shares the last line below the local details', () => {
    const body = addLocalDetailsToRewrittenBody(
      'Request: Please repair it. Thank you.',
      { ...baseInput, latitude: null, longitude: null, profile: { name: 'Ada', email: '', phone: '' } }
    );

    expect(body).toBe('Request: Please repair it.\n\nContact:\nName: Ada\n\nThank you.');
  });

  it('appends local details when the rewritten body has no sign-off', () => {
    const body = addLocalDetailsToRewrittenBody('Issue: Damaged bin lid', {
      ...baseInput,
      latitude: null,
      longitude: null,
      profile: { name: 'Ada', email: '', phone: '' },
    });

    expect(body).toBe('Issue: Damaged bin lid\n\nContact:\nName: Ada');
  });
});
