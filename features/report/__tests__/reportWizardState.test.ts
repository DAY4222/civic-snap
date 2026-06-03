import {
  canContinueFromLocation,
  canPreviewReport,
  createInitialReportWizardState,
  filterIssueCategories,
  getPhotoVisionErrorStatus,
  getPhotoVisionStatus,
  reportWizardReducer,
  shouldStartPhotoAnalysis,
} from '../reportWizardState';
import {
  makePhotoIssueCandidate,
  makePhotoVisionResult,
} from '@/lib/testUtils/photoVisionFixtures';
import type { PhotoIssueCandidate, PhotoVisionResult, Report } from '@/lib/types';
import { PhotoVisionError } from '@/lib/vision';

const topic: PhotoIssueCandidate = makePhotoIssueCandidate();

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
  thumbnailUri: 'file:///photo-thumb.jpg',
  photoVisionResult: null,
  photoIssueTopic: null,
  emailSubject: '311 service request: Road Pothole / Road Damage',
  emailBody: 'Hello',
  status: 'Draft',
  caseNumber: '',
  createdAt: '2026-05-20T00:00:00.000Z',
  updatedAt: '2026-05-20T00:00:00.000Z',
};

const photoVisionResult: PhotoVisionResult = makePhotoVisionResult({ issueCandidates: [topic] });

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

  it('dismisses the saved report banner without changing stable settings', () => {
    let state = createInitialReportWizardState();
    state = reportWizardReducer(state, { type: 'setPhotoAnalysisUserEnabled', enabled: true });
    state = reportWizardReducer(state, {
      type: 'profileLoaded',
      profile: { name: 'Ada', email: '', phone: '555-0100' },
    });
    state = reportWizardReducer(state, { type: 'resetReport', savedBannerId: 'report-1' });

    state = reportWizardReducer(state, { type: 'dismissSavedBanner' });

    expect(state.step).toBe('start');
    expect(state.savedBannerId).toBeNull();
    expect(state.photoAnalysisUserEnabled).toBe(true);
    expect(state.profile.name).toBe('Ada');
  });

  it('resets active report progress while preserving stable settings', () => {
    let state = createInitialReportWizardState();
    state = reportWizardReducer(state, { type: 'setPhotoAnalysisUserEnabled', enabled: true });
    state = reportWizardReducer(state, {
      type: 'profileLoaded',
      profile: { name: 'Ada', email: 'ada@example.com', phone: '555-0100' },
    });
    state = reportWizardReducer(state, { type: 'photoStored', photoUri: 'file:///photo.jpg' });
    state = reportWizardReducer(state, {
      type: 'chooseCategory',
      categoryId: 'road-pothole-road-damage',
    });
    state = reportWizardReducer(state, { type: 'setAddress', address: '123 Queen St W' });
    state = reportWizardReducer(state, { type: 'setLocationNote', locationNote: 'south curb' });
    state = reportWizardReducer(state, {
      type: 'setPinLocation',
      latitude: 43.65,
      longitude: -79.38,
    });
    state = reportWizardReducer(state, { type: 'setDescription', description: 'Large pothole.' });
    state = reportWizardReducer(state, { type: 'setAnswer', questionId: 'q1', value: 'yes' });
    state = reportWizardReducer(state, {
      type: 'previewReady',
      emailBody: 'Body',
      emailSubject: 'Subject',
      savedReportId: 'report-1',
    });

    state = reportWizardReducer(state, { type: 'resetReport' });

    expect(state.step).toBe('start');
    expect(state.savedReportId).toBeNull();
    expect(state.savedBannerId).toBeNull();
    expect(state.address).toBe('');
    expect(state.answers).toEqual({});
    expect(state.description).toBe('');
    expect(state.emailBody).toBe('');
    expect(state.emailSubject).toBe('');
    expect(state.latitude).toBeNull();
    expect(state.locationNote).toBe('');
    expect(state.longitude).toBeNull();
    expect(state.photoUri).toBeNull();
    expect(state.selectedCategoryId).toBeNull();
    expect(state.photoAnalysisUserEnabled).toBe(true);
    expect(state.profile.name).toBe('Ada');
  });

  it('preserves active report progress when enabling photo analysis', () => {
    let state = createInitialReportWizardState();
    state = reportWizardReducer(state, { type: 'photoStored', photoUri: 'file:///photo.jpg' });
    state = reportWizardReducer(state, { type: 'setStep', step: 'location' });
    state = reportWizardReducer(state, { type: 'setAddress', address: '123 Queen St W' });
    state = reportWizardReducer(state, { type: 'setLocationNote', locationNote: 'south curb' });

    state = reportWizardReducer(state, { type: 'setPhotoAnalysisUserEnabled', enabled: true });

    expect(state.photoAnalysisUserEnabled).toBe(true);
    expect(state.photoUri).toBe('file:///photo.jpg');
    expect(state.step).toBe('location');
    expect(state.address).toBe('123 Queen St W');
    expect(state.locationNote).toBe('south curb');
  });

  it('ignores stale photo analysis updates from previous photos', () => {
    let state = createInitialReportWizardState();
    state = reportWizardReducer(state, { type: 'photoStored', photoUri: 'file:///first.jpg' });
    state = reportWizardReducer(state, {
      type: 'setPhotoVisionLoading',
      photoUri: 'file:///first.jpg',
    });
    expect(state.photoVisionStatus).toBe('loading');
    expect(state.photoVisionPhotoUri).toBe('file:///first.jpg');

    state = reportWizardReducer(state, { type: 'photoStored', photoUri: 'file:///second.jpg' });
    state = reportWizardReducer(state, {
      type: 'setPhotoVisionResult',
      photoUri: 'file:///first.jpg',
      result: photoVisionResult,
    });
    expect(state.photoVisionStatus).toBe('idle');
    expect(state.photoVisionResult).toBeNull();

    state = reportWizardReducer(state, {
      type: 'setPhotoVisionLoading',
      photoUri: 'file:///second.jpg',
    });
    state = reportWizardReducer(state, {
      type: 'setPhotoVisionError',
      photoUri: 'file:///first.jpg',
      error: new Error('late failure'),
    });
    expect(state.photoVisionStatus).toBe('loading');
    expect(state.photoVisionPhotoUri).toBe('file:///second.jpg');

    state = reportWizardReducer(state, {
      type: 'setPhotoVisionError',
      photoUri: 'file:///second.jpg',
      error: new Error('current failure'),
    });
    expect(state.photoVisionStatus).toBe('error');
    expect(state.photoVisionPhotoUri).toBe('file:///second.jpg');
  });

  it('decides when background photo analysis should start', () => {
    let state = createInitialReportWizardState();
    expect(shouldStartPhotoAnalysis(state, true)).toBe(false);

    state = reportWizardReducer(state, { type: 'photoStored', photoUri: 'file:///photo.jpg' });
    expect(shouldStartPhotoAnalysis(state, false)).toBe(false);
    expect(shouldStartPhotoAnalysis(state, true)).toBe(true);

    state = reportWizardReducer(state, {
      type: 'setPhotoVisionLoading',
      photoUri: 'file:///photo.jpg',
    });
    expect(shouldStartPhotoAnalysis(state, true)).toBe(false);

    state = reportWizardReducer(state, {
      type: 'setPhotoVisionResult',
      photoUri: 'file:///photo.jpg',
      result: photoVisionResult,
    });
    expect(shouldStartPhotoAnalysis(state, true)).toBe(false);
  });

  it('uses common issue categories before the user searches', () => {
    expect(filterIssueCategories('').map((category) => category.id)).toEqual([
      'road-pothole-road-damage',
      'clean-up-illegal-dumping-on-city-road-allowance',
      'traffic-signal-repair',
      'missing-damaged-street-or-traffic-signs',
      'catch-basin-blocked-flooding',
      'damaged-concrete-sidewalk',
    ]);

    expect(
      filterIssueCategories('pothole').some(
        (category) => category.id === 'road-pothole-road-damage'
      )
    ).toBe(true);
  });

  it('checks location and preview readiness', () => {
    const state = createInitialReportWizardState();
    expect(canContinueFromLocation(state)).toBe(false);
    expect(canPreviewReport(state)).toBe(false);

    const withAddress = reportWizardReducer(state, {
      type: 'setAddress',
      address: '123 Queen St W',
    });
    expect(canContinueFromLocation(withAddress)).toBe(true);
    expect(canPreviewReport(withAddress)).toBe(false);

    const withDescription = reportWizardReducer(withAddress, {
      type: 'setDescription',
      description: 'Large pothole in curb lane.',
    });
    expect(canPreviewReport(withDescription)).toBe(true);

    const withPin = reportWizardReducer(state, {
      type: 'setPinLocation',
      latitude: 43.65,
      longitude: -79.38,
    });
    expect(canContinueFromLocation(withPin)).toBe(true);
  });

  it('classifies photo vision status from normalized results', () => {
    expect(getPhotoVisionStatus(null)).toBe('idle');
    expect(getPhotoVisionStatus(photoVisionResult)).toBe('ready');
    expect(
      getPhotoVisionStatus({
        ...photoVisionResult,
        issueCandidates: [],
      })
    ).toBe('empty');
    expect(
      getPhotoVisionStatus({
        ...photoVisionResult,
        issueCandidates: [topic],
        suggestedLabels: [],
      })
    ).toBe('ready');
  });

  it('maps photo vision errors to user-facing statuses', () => {
    expect(
      getPhotoVisionErrorStatus(new PhotoVisionError('Photo label limit reached.', 'rate-limited'))
    ).toBe('rate-limited');
    expect(
      getPhotoVisionErrorStatus(
        new PhotoVisionError('Photo analysis image is too large.', 'payload-too-large')
      )
    ).toBe('payload-too-large');
    expect(getPhotoVisionErrorStatus(new Error('network failed'))).toBe('error');
  });
});
