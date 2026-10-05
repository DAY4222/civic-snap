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
import { EMPTY_DRAFT, getDraftCategory } from '@/lib/reportDraft';
import {
  makePhotoIssueCandidate,
  makePhotoVisionResult,
} from '@/lib/testUtils/photoVisionFixtures';
import type { PhotoIssueCandidate, PhotoVisionResult, Report } from '@/lib/types';
import { BackendError } from '@/lib/backend/client';

const topic: PhotoIssueCandidate = makePhotoIssueCandidate();

const report: Report = {
  ...EMPTY_DRAFT,
  id: 'report-1',
  categoryId: 'road-pothole-road-damage',
  category: 'Road Pothole / Road Damage',
  description: 'Large pothole in curb lane.',
  answers: { one: 'answer' },
  address: '123 Queen St W',
  locationNote: 'south curb',
  latitude: 43.65,
  longitude: -79.38,
  photoUri: 'file:///photo.jpg',
  thumbnailUri: 'file:///photo-thumb.jpg',
  emailSubject: '311 service request: Road Pothole / Road Damage',
  emailBody: 'Hello',
  emailSource: 'generated',
  status: 'draft',
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
    expect(state.draft.categoryId).toBe('road-pothole-road-damage');
    expect(state.draft.photoIssueTopic).toBeNull();

    state = reportWizardReducer(state, { type: 'openCategory', returnStep: 'details' });
    state = reportWizardReducer(state, { type: 'backFromCategory' });
    expect(state.step).toBe('details');
  });

  it('keeps photo topic selection mutually exclusive with manual categories', () => {
    let state = createInitialReportWizardState();
    state = reportWizardReducer(state, {
      type: 'chooseCategory',
      categoryId: 'damaged-concrete-sidewalk',
    });
    state = reportWizardReducer(state, { type: 'setAnswer', questionId: 'q1', value: 'yes' });

    state = reportWizardReducer(state, { type: 'togglePhotoIssueTopic', topic });
    expect(state.draft.categoryId).toBe(topic.issueId);
    expect(state.draft.photoIssueTopic?.issueId).toBe(topic.issueId);
    expect(state.draft.answers).toEqual({});

    state = reportWizardReducer(state, { type: 'togglePhotoIssueTopic', topic });
    expect(state.draft.photoIssueTopic).toBeNull();
    expect(state.draft.categoryId).toBeNull();
  });

  it('keeps checklist answers when a photo suggestion confirms the issue already chosen', () => {
    let state = createInitialReportWizardState();
    state = reportWizardReducer(state, { type: 'chooseCategory', categoryId: topic.issueId });
    state = reportWizardReducer(state, { type: 'setAnswer', questionId: 'q1', value: 'yes' });

    state = reportWizardReducer(state, { type: 'togglePhotoIssueTopic', topic });

    expect(state.draft.photoIssueTopic?.issueId).toBe(topic.issueId);
    expect(state.draft.answers).toEqual({ q1: 'yes' });
  });

  it('restores a saved draft, including the location note, into the details step', () => {
    const state = reportWizardReducer(createInitialReportWizardState(), {
      type: 'resumeReport',
      report,
    });

    expect(state.step).toBe('details');
    expect(state.savedReportId).toBe(report.id);
    expect(state.draft.description).toBe(report.description);
    expect(state.draft.answers).toEqual(report.answers);
    expect(state.draft.locationNote).toBe('south curb');
  });

  it('restores an edited email as written, and a generated one as generated', () => {
    const edited = reportWizardReducer(createInitialReportWizardState(), {
      type: 'resumeReport',
      report: { ...report, emailSource: 'user', emailBody: 'My own words' },
    });
    expect(edited.email.source).toBe('user');
    expect(edited.email.override?.body).toBe('My own words');

    const generated = reportWizardReducer(createInitialReportWizardState(), {
      type: 'resumeReport',
      report,
    });
    expect(generated.email.source).toBe('generated');
    expect(generated.email.override).toBeNull();
  });

  it('keeps user edits through profile changes and clears them on rebuild', () => {
    const generatedEmail = { subject: 'Subject', body: 'Generated' };
    let state = reportWizardReducer(createInitialReportWizardState(), {
      type: 'editEmail',
      content: { subject: 'Subject', body: 'Edited' },
      generated: generatedEmail,
    });
    state = reportWizardReducer(state, {
      type: 'profileLoaded',
      profile: { name: 'Ada', email: '', phone: '' },
    });
    expect(state.email.override?.body).toBe('Edited');

    state = reportWizardReducer(state, { type: 'rebuildEmail' });
    expect(state.email.source).toBe('generated');
  });

  it('turns legacy joined multi-choice answers into lists when resuming', () => {
    const multiQuestion = getDraftCategory({
      categoryId: 'construction-noise',
      photoIssueTopic: null,
    }).questions.find((question) => question.answerType === 'multipicklist');
    if (!multiQuestion) throw new Error('Expected a multi-choice question on this issue');
    const [first, second] = multiQuestion.options.map((option) => option.label);

    const state = reportWizardReducer(createInitialReportWizardState(), {
      type: 'resumeReport',
      report: {
        ...report,
        categoryId: 'construction-noise',
        answers: { [multiQuestion.id]: `${first}, ${second}` },
      },
    });

    expect(state.draft.answers[multiQuestion.id]).toEqual([first, second]);
  });

  it('records the autosaved draft id once, without replacing an existing one', () => {
    let state = reportWizardReducer(createInitialReportWizardState(), {
      type: 'draftCreated',
      reportId: 'report-1',
    });
    expect(state.savedReportId).toBe('report-1');

    state = reportWizardReducer(state, { type: 'draftCreated', reportId: 'report-2' });
    expect(state.savedReportId).toBe('report-1');
  });

  it('moves through preview, fallback, and reset without losing stable settings', () => {
    let state = createInitialReportWizardState();
    state = reportWizardReducer(state, { type: 'setPhotoAnalysisUserEnabled', enabled: true });
    state = reportWizardReducer(state, {
      type: 'profileLoaded',
      profile: { name: 'Ada', email: '', phone: '555-0100' },
    });
    state = reportWizardReducer(state, { type: 'previewReady', savedReportId: 'report-1' });
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
    state = reportWizardReducer(state, { type: 'previewReady', savedReportId: 'report-1' });

    state = reportWizardReducer(state, { type: 'resetReport' });

    expect(state.step).toBe('start');
    expect(state.savedReportId).toBeNull();
    expect(state.savedBannerId).toBeNull();
    expect(state.draft).toEqual(EMPTY_DRAFT);
    expect(state.email.source).toBe('generated');
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
    expect(state.draft.photoUri).toBe('file:///photo.jpg');
    expect(state.step).toBe('location');
    expect(state.draft.address).toBe('123 Queen St W');
    expect(state.draft.locationNote).toBe('south curb');
  });

  it('drops the photo-suggested issue, but not a manual one, when the photo changes', () => {
    let state = createInitialReportWizardState();
    state = reportWizardReducer(state, { type: 'photoStored', photoUri: 'file:///first.jpg' });
    state = reportWizardReducer(state, { type: 'togglePhotoIssueTopic', topic });
    state = reportWizardReducer(state, { type: 'photoStored', photoUri: 'file:///second.jpg' });
    expect(state.draft.categoryId).toBeNull();
    expect(state.draft.photoIssueTopic).toBeNull();

    state = reportWizardReducer(state, {
      type: 'chooseCategory',
      categoryId: 'road-pothole-road-damage',
    });
    state = reportWizardReducer(state, { type: 'photoStored', photoUri: 'file:///third.jpg' });
    expect(state.draft.categoryId).toBe('road-pothole-road-damage');
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
    expect(state.draft.photoVisionResult).toBeNull();

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

  it('falls back to general or the suggested title, never another catalog issue', () => {
    expect(getDraftCategory({ categoryId: 'retired-issue-id', photoIssueTopic: null }).id).toBe(
      'general'
    );

    const unknownTopic = makePhotoIssueCandidate({
      issueId: 'issue-from-newer-catalog',
      title: 'Issue From Newer Catalog',
    });
    const category = getDraftCategory({
      categoryId: unknownTopic.issueId,
      photoIssueTopic: unknownTopic,
    });
    expect(category.title).toBe('Issue From Newer Catalog');
    expect(category.questions).toEqual([]);
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
    expect(canContinueFromLocation(state.draft)).toBe(false);
    expect(canPreviewReport(state.draft)).toBe(false);

    const withAddress = reportWizardReducer(state, {
      type: 'setAddress',
      address: '123 Queen St W',
    });
    expect(canContinueFromLocation(withAddress.draft)).toBe(true);
    expect(canPreviewReport(withAddress.draft)).toBe(false);

    const withDescription = reportWizardReducer(withAddress, {
      type: 'setDescription',
      description: 'Large pothole in curb lane.',
    });
    expect(canPreviewReport(withDescription.draft)).toBe(true);

    const withPin = reportWizardReducer(state, {
      type: 'setPinLocation',
      latitude: 43.65,
      longitude: -79.38,
    });
    expect(canContinueFromLocation(withPin.draft)).toBe(true);
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
      getPhotoVisionErrorStatus(new BackendError('Photo label limit reached.', 'rate-limited'))
    ).toBe('rate-limited');
    expect(
      getPhotoVisionErrorStatus(
        new BackendError('Photo analysis image is too large.', 'payload-too-large')
      )
    ).toBe('payload-too-large');
    expect(
      getPhotoVisionErrorStatus(new BackendError('Photo labels could not connect.', 'offline'))
    ).toBe('offline');
    expect(getPhotoVisionErrorStatus(new Error('network failed'))).toBe('error');
  });
});
