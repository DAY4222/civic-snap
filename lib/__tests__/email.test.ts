import { ISSUE_CATEGORIES } from '../categories';
import { buildEmail } from '../email';
import type { DraftReportInput, IssueCategory, PhotoIssueCandidate } from '../types';

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
});
