import { ISSUE_CATEGORIES } from '../categories';
import { buildEmail } from '../email';
import type { DraftReportInput, IssueCategory } from '../types';

const baseInput: DraftReportInput = {
  category: ISSUE_CATEGORIES[0],
  description: 'Large pothole beside the crosswalk',
  answers: {
    size: 'larger than a dinner plate',
    position: 'curb lane',
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

describe('buildEmail', () => {
  it('builds a Toronto 311 draft with report details and trimmed contact info', () => {
    const email = buildEmail(baseInput);

    expect(email.recipient).toBe('311@toronto.ca');
    expect(email.subject).toBe('311 service request: Pothole or road damage');
    expect(email.body).toContain('Location:\n123 Queen St W');
    expect(email.body).toContain('Location note: north curb');
    expect(email.body).toContain('GPS: 43.653481, -79.383935');
    expect(email.body).toContain('- Approximate size: larger than a dinner plate');
    expect(email.body).toContain('- Exact position: curb lane');
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
      observations: [],
      questions: [],
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
});
