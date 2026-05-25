import {
  createInitialReportWizardState,
  getPhotoVisionStatus,
  reportWizardReducer,
} from '../reportWizardState';
import type { PhotoIssueCandidate, Report } from '@/lib/types';

const topic: PhotoIssueCandidate = {
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

const report: Report = {
  id: 'report-1',
  categoryId: 'road-pothole-road-damage',
  category: 'Road Pothole / Road Damage',
  description: 'Large pothole in curb lane.',
  answers: { one: 'answer' },
  address: '123 Queen St W',
  latitude: 43.65,
  longitude: -79.38,
  photoUri: 'file:///photo.jpg',
  photoVisionResult: null,
  photoIssueTopic: null,
  emailSubject: '311 service request: Road Pothole / Road Damage',
  emailBody: 'Hello',
  status: 'Draft',
  caseNumber: '',
  createdAt: '2026-05-20T00:00:00.000Z',
  updatedAt: '2026-05-20T00:00:00.000Z',
};

describe('report wizard reducer', () => {
  it('walks manual issue selection back to the intended return step', () => {
    let state = createInitialReportWizardState();

    state = reportWizardReducer(state, { type: 'openCategory', returnStep: 'location' });
    expect(state.step).toBe('category');

    state = reportWizardReducer(state, {
      type: 'chooseCategory',
      categoryId: 'road-pothole-road-damage',
    });
    expect(state.step).toBe('location');
    expect(state.selectedCategoryId).toBe('road-pothole-road-damage');
    expect(state.selectedPhotoIssueTopic).toBeNull();

    state = reportWizardReducer(state, { type: 'openCategory', returnStep: 'details' });
    state = reportWizardReducer(state, { type: 'backFromCategory' });
    expect(state.step).toBe('details');
  });

  it('keeps photo topic selection mutually exclusive with manual categories', () => {
    let state = createInitialReportWizardState();
    state = reportWizardReducer(state, {
      type: 'chooseCategory',
      categoryId: 'road-pothole-road-damage',
    });
    state = reportWizardReducer(state, { type: 'setAnswer', questionId: 'q1', value: 'yes' });

    state = reportWizardReducer(state, { type: 'togglePhotoIssueTopic', topic });
    expect(state.selectedCategoryId).toBeNull();
    expect(state.selectedPhotoIssueTopic?.issueId).toBe(topic.issueId);
    expect(state.answers).toEqual({});

    state = reportWizardReducer(state, { type: 'togglePhotoIssueTopic', topic });
    expect(state.selectedPhotoIssueTopic).toBeNull();
  });

  it('restores a saved draft into the details step', () => {
    const state = reportWizardReducer(createInitialReportWizardState(), {
      type: 'resumeReport',
      report,
    });

    expect(state.step).toBe('details');
    expect(state.savedReportId).toBe(report.id);
    expect(state.description).toBe(report.description);
    expect(state.answers).toEqual(report.answers);
  });

  it('moves through preview, fallback, and reset without losing stable settings', () => {
    let state = createInitialReportWizardState();
    state = reportWizardReducer(state, { type: 'setPhotoAnalysisUserEnabled', enabled: true });
    state = reportWizardReducer(state, {
      type: 'profileLoaded',
      profile: { name: 'Ada', email: '', phone: '555-0100' },
    });
    state = reportWizardReducer(state, {
      type: 'previewReady',
      emailBody: 'Body',
      emailSubject: 'Subject',
      savedReportId: 'report-1',
    });
    expect(state.step).toBe('preview');

    state = reportWizardReducer(state, { type: 'setStep', step: 'fallback' });
    expect(state.step).toBe('fallback');

    state = reportWizardReducer(state, { type: 'resetReport', savedBannerId: 'report-1' });
    expect(state.step).toBe('start');
    expect(state.savedBannerId).toBe('report-1');
    expect(state.photoAnalysisUserEnabled).toBe(true);
    expect(state.profile.name).toBe('Ada');
  });

  it('classifies photo vision status from normalized results', () => {
    expect(getPhotoVisionStatus(null)).toBe('idle');
    expect(
      getPhotoVisionStatus({
        suggestedLabels: [],
        issueCandidates: [],
        provider: 'gemini',
        model: 'model',
        promptVersion: 'prompt',
        taxonomyVersion: 'taxonomy',
        analyzedAt: '2026-05-20T00:00:00.000Z',
        latencyMs: 10,
        image: { bytes: 10, height: 100, mimeType: 'image/jpeg', width: 100 },
      })
    ).toBe('empty');
  });
});
