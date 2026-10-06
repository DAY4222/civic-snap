import {
  canContinueFromLocation,
  canPreviewReport,
  createInitialReportWizardState,
  getPhotoVisionErrorStatus,
  getPhotoVisionStatus,
  getPreviousStep,
  getSuggestStepMode,
  getTrackerIndex,
  isPhotoVisionFailure,
  reportWizardReducer,
  searchIssueCategories,
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
  handoffMethod: null,
  handoffApp: null,
  handedOffAt: null,
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
    expect(getPreviousStep(state)).toBe('details');
    expect(getTrackerIndex(state)).toBe(2);
  });

  it('steps Back through the wizard and leaves it from the first step', () => {
    const initial = createInitialReportWizardState();
    const at = (step: typeof initial.step, issueStep: typeof initial.issueStep = 'category') => ({
      ...initial,
      issueStep,
      step,
    });

    // Without photo suggestions the issue search is the first step.
    expect(getPreviousStep(at('category'))).toBeNull();
    expect(getPreviousStep(at('location'))).toBe('category');
    // With them, the suggest step comes first and the search sits behind it.
    expect(getPreviousStep(at('suggest', 'suggest'))).toBeNull();
    expect(getPreviousStep(at('category', 'suggest'))).toBe('suggest');
    expect(getPreviousStep(at('location', 'suggest'))).toBe('suggest');
    // Searching from Details returns to Details either way.
    expect(getPreviousStep({ ...at('category', 'suggest'), categoryReturnStep: 'details' })).toBe(
      'details'
    );
    expect(getPreviousStep(at('details'))).toBe('location');
    expect(getPreviousStep(at('preview'))).toBe('details');
    expect(getPreviousStep(at('fallback'))).toBe('preview');
    expect(getPreviousStep(at('done'))).toBeNull();

    expect(
      [at('suggest'), at('category'), at('location'), at('details'), at('preview')].map(
        getTrackerIndex
      )
    ).toEqual([0, 0, 1, 2, 3]);
  });

  it('starts a photo report on the suggest step, or on the search when suggestions are off', () => {
    const photo = reportWizardReducer(createInitialReportWizardState(), {
      type: 'photoStored',
      photoUri: 'file:///photo.jpg',
    });

    const suggesting = reportWizardReducer(photo, { type: 'startPhotoPath', suggest: true });
    expect(suggesting.step).toBe('suggest');
    expect(suggesting.issueStep).toBe('suggest');

    const searching = reportWizardReducer(photo, { type: 'startPhotoPath', suggest: false });
    expect(searching.step).toBe('category');
    expect(searching.issueStep).toBe('category');
    expect(searching.categoryReturnStep).toBe('location');
  });

  it('takes a suggested issue and moves on, keeping answers for the same issue', () => {
    let state = createInitialReportWizardState();
    state = reportWizardReducer(state, { type: 'chooseCategory', categoryId: topic.issueId });
    state = reportWizardReducer(state, { type: 'setAnswer', questionId: 'q1', value: 'yes' });
    state = reportWizardReducer(state, { type: 'setStep', step: 'suggest' });

    state = reportWizardReducer(state, { type: 'chooseSuggestedTopic', topic });
    expect(state.step).toBe('location');
    expect(state.draft.categoryId).toBe(topic.issueId);
    expect(state.draft.photoIssueTopic?.issueId).toBe(topic.issueId);
    expect(state.draft.answers).toEqual({ q1: 'yes' });

    // Choosing it again (after coming back) keeps it selected rather than toggling it off.
    state = reportWizardReducer(state, { type: 'chooseSuggestedTopic', topic });
    expect(state.draft.photoIssueTopic?.issueId).toBe(topic.issueId);

    const other = makePhotoIssueCandidate({ issueId: 'damaged-concrete-sidewalk' });
    state = reportWizardReducer(state, { type: 'chooseSuggestedTopic', topic: other });
    expect(state.draft.categoryId).toBe('damaged-concrete-sidewalk');
    expect(state.draft.answers).toEqual({});
  });

  it('shows the opt-in, then the check, then its result on the suggest step', () => {
    expect(getSuggestStepMode({ photoAnalysisChoice: 'unset', photoVisionStatus: 'idle' })).toBe(
      'opt-in'
    );
    expect(getSuggestStepMode({ photoAnalysisChoice: 'on', photoVisionStatus: 'idle' })).toBe(
      'loading'
    );
    expect(getSuggestStepMode({ photoAnalysisChoice: 'on', photoVisionStatus: 'loading' })).toBe(
      'loading'
    );
    expect(getSuggestStepMode({ photoAnalysisChoice: 'on', photoVisionStatus: 'ready' })).toBe(
      'ready'
    );
    for (const status of ['empty', 'error', 'offline', 'rate-limited', 'payload-too-large'] as const) {
      expect(isPhotoVisionFailure(status)).toBe(true);
      expect(getSuggestStepMode({ photoAnalysisChoice: 'on', photoVisionStatus: status })).toBe(
        'failed'
      );
    }
  });

  it('remembers the suggest step for a resumed draft that has photo suggestions', () => {
    const withSuggestions = reportWizardReducer(createInitialReportWizardState(), {
      type: 'resumeReport',
      report: { ...report, photoVisionResult },
    });
    expect(withSuggestions.issueStep).toBe('suggest');

    const without = reportWizardReducer(createInitialReportWizardState(), {
      type: 'resumeReport',
      report: { ...report, photoVisionResult: null },
    });
    expect(without.issueStep).toBe('category');
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

  it('moves through preview and fallback to the done step without losing stable settings', () => {
    let state = createInitialReportWizardState();
    state = reportWizardReducer(state, { type: 'setPhotoAnalysisChoice', choice: 'on' });
    state = reportWizardReducer(state, { type: 'setEmailPolishEnabled', enabled: true });
    state = reportWizardReducer(state, {
      type: 'profileLoaded',
      profile: { name: 'Ada', email: '', phone: '555-0100' },
    });
    state = reportWizardReducer(state, { type: 'previewReady', savedReportId: 'report-1' });
    expect(state.step).toBe('preview');

    state = reportWizardReducer(state, { type: 'setStep', step: 'fallback' });
    expect(state.step).toBe('fallback');

    state = reportWizardReducer(state, {
      type: 'handoffFinished',
      app: 'Gmail',
      reportId: 'report-1',
      status: 'handed_off',
    });
    expect(state.step).toBe('done');
    expect(state.lastHandoff).toEqual({ app: 'Gmail', reportId: 'report-1', status: 'handed_off' });
    expect(state.savedReportId).toBeNull();
    expect(state.draft).toEqual(EMPTY_DRAFT);
    expect(state.photoAnalysisChoice).toBe('on');
    expect(state.emailPolishEnabled).toBe(true);
    expect(state.profile.name).toBe('Ada');
  });

  it('confirms a handed-off report from the done step', () => {
    let state = reportWizardReducer(createInitialReportWizardState(), {
      type: 'handoffFinished',
      app: null,
      reportId: 'report-1',
      status: 'handed_off',
    });

    state = reportWizardReducer(state, { type: 'handoffConfirmed' });
    expect(state.lastHandoff?.status).toBe('sent');
  });

  it('preserves active report progress when enabling photo analysis', () => {
    let state = createInitialReportWizardState();
    state = reportWizardReducer(state, { type: 'photoStored', photoUri: 'file:///photo.jpg' });
    state = reportWizardReducer(state, { type: 'setStep', step: 'location' });
    state = reportWizardReducer(state, { type: 'setAddress', address: '123 Queen St W' });
    state = reportWizardReducer(state, { type: 'setLocationNote', locationNote: 'south curb' });

    state = reportWizardReducer(state, { type: 'setPhotoAnalysisChoice', choice: 'on' });

    expect(state.photoAnalysisChoice).toBe('on');
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
    expect(searchIssueCategories('').categories.map((category) => category.id)).toEqual([
      'road-pothole-road-damage',
      'clean-up-illegal-dumping-on-city-road-allowance',
      'traffic-signal-repair',
      'missing-damaged-street-or-traffic-signs',
      'catch-basin-blocked-flooding',
      'damaged-concrete-sidewalk',
    ]);

    expect(
      searchIssueCategories('pothole').categories.some(
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
      source: 'photo',
    });
    expect(canContinueFromLocation(withPin.draft)).toBe(true);
    expect(withPin.pinSource).toBe('photo');
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
