import { ISSUE_CATEGORIES } from '../categories';
import { EMAIL_REWRITE_PROMPT_VERSION, buildEmailRewritePromptPayload } from '../emailRewrite';
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
    email: ' ada@example.com ',
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

describe('buildEmailRewritePromptPayload', () => {
  it('exposes the client payload version used by the rewrite backend', () => {
    expect(EMAIL_REWRITE_PROMPT_VERSION).toBe('toronto-311-email-rewrite-v2');
  });

  it('builds structured rewrite context from the deterministic email draft', () => {
    const payload = buildEmailRewritePromptPayload(baseInput, 'Local draft body');

    expect(payload.issue_label).toBe('Residential Bin Lid Damaged');
    expect(payload.issue_description).toBe('Damaged residential bin lid');
    expect(payload.default_email).toBe('Local draft body');
    expect(payload.location).toBe('123 Queen St W\nLocation note: north curb\nGPS: 43.653481, -79.383935');
    expect(payload.guided_answers).toEqual([
      'What is this request about?: Request Repairs for a Damaged Bin',
      'What part is damaged?: Lid',
    ]);
    expect(payload.contact_details).toBe('Name: Ada Lovelace\nEmail: ada@example.com\nPhone: 555-0100');
  });

  it('summarizes photo topic evidence without exposing local file paths', () => {
    const payload = buildEmailRewritePromptPayload(
      {
        ...baseInput,
        photoIssueTopic,
      },
      'Local draft body'
    );

    expect(payload.photo_evidence).toContain('Road Pothole / Road Damage');
    expect(payload.photo_evidence).toContain('Evidence: Road pothole');
    expect(payload.photo_evidence).toContain('The photo shows a road pothole.');
    expect(payload.photo_evidence).toContain('Photo attached.');
    expect(JSON.stringify(payload)).not.toContain('file:///report-photo.jpg');
  });

  it('keeps missing optional context blank instead of inventing details', () => {
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

    const payload = buildEmailRewritePromptPayload(
      {
        ...baseInput,
        category: generalCategory,
        answers: {},
        address: '',
        locationNote: '',
        latitude: null,
        longitude: null,
        photoUri: null,
        profile: {
          name: '',
          email: '',
          phone: '',
        },
      },
      'Local draft body'
    );

    expect(payload.default_email).toBe('Local draft body');
    expect(payload.location).toBe('');
    expect(payload.guided_answers).toEqual([]);
    expect(payload.photo_evidence).toBe('');
    expect(payload.contact_details).toBe('');
  });
});
