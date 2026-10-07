import { ISSUE_CATEGORIES } from '@/lib/categories';
import { EMPTY_PROFILE } from '@/lib/profile';
import { EMPTY_DRAFT, draftFromReport } from '@/lib/reportDraft';
import {
  IssueCategory,
  PhotoIssueCandidate,
  PhotoVisionResult,
  Profile,
  Report,
  ReportAnswerValue,
  ReportDraft,
} from '@/lib/types';
import { PhotoVisionError } from '@/lib/vision';

export type ReportWizardStep = 'start' | 'category' | 'location' | 'details' | 'preview' | 'fallback';
export type CategoryReturnStep = 'location' | 'details';
export type PhotoVisionStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'empty'
  | 'error'
  | 'offline'
  | 'rate-limited'
  | 'payload-too-large';

const COMMON_ISSUE_CATEGORY_IDS = [
  'road-pothole-road-damage',
  'clean-up-illegal-dumping-on-city-road-allowance',
  'traffic-signal-repair',
  'missing-damaged-street-or-traffic-signs',
  'catch-basin-blocked-flooding',
  'damaged-concrete-sidewalk',
];

export type ReportWizardState = {
  /** The report being written; everything else here is screen state. */
  draft: ReportDraft;
  busy: boolean;
  categoryReturnStep: CategoryReturnStep;
  dismissedContactPrompt: boolean;
  emailBody: string;
  emailSubject: string;
  issueSearchQuery: string;
  photoAnalysisUserEnabled: boolean;
  photoVisionPhotoUri: string | null;
  photoVisionStatus: PhotoVisionStatus;
  profile: Profile;
  savedBannerId: string | null;
  savedReportId: string | null;
  step: ReportWizardStep;
};

export type ReportWizardAction =
  | { type: 'appendDescription'; value: string }
  | { type: 'backFromCategory' }
  | { type: 'chooseCategory'; categoryId: string | null }
  | { type: 'dismissContactPrompt' }
  | { type: 'dismissSavedBanner' }
  | { type: 'draftCreated'; reportId: string }
  | { type: 'openCategory'; returnStep: CategoryReturnStep }
  | { type: 'photoStored'; photoUri: string; thumbnailUri?: string | null }
  | { type: 'previewReady'; emailBody: string; emailSubject: string; savedReportId: string }
  | { type: 'profileLoaded'; profile: Profile; emailBody?: string; emailSubject?: string }
  | { type: 'resetReport'; savedBannerId?: string | null }
  | { type: 'resumeReport'; report: Report }
  | { type: 'setAddress'; address: string }
  | { type: 'setAnswer'; questionId: string; value: ReportAnswerValue }
  | { type: 'setBusy'; busy: boolean }
  | { type: 'setDescription'; description: string }
  | { type: 'setEmailBody'; emailBody: string }
  | { type: 'setEmailSubject'; emailSubject: string }
  | { type: 'setIssueSearchQuery'; issueSearchQuery: string }
  | { type: 'setLocationNote'; locationNote: string }
  | { type: 'setPhotoAnalysisUserEnabled'; enabled: boolean }
  | { type: 'setPhotoVisionError'; photoUri: string; error: unknown }
  | { type: 'setPhotoVisionLoading'; photoUri: string }
  | { type: 'setPhotoVisionResult'; photoUri: string; result: PhotoVisionResult }
  | { type: 'setPinLocation'; latitude: number; longitude: number }
  | { type: 'setStep'; step: ReportWizardStep }
  | { type: 'setResolvedAddress'; address: string }
  | { type: 'togglePhotoIssueTopic'; topic: PhotoIssueCandidate };

export function createInitialReportWizardState(): ReportWizardState {
  return {
    draft: EMPTY_DRAFT,
    busy: false,
    categoryReturnStep: 'location',
    dismissedContactPrompt: false,
    emailBody: '',
    emailSubject: '',
    issueSearchQuery: '',
    photoAnalysisUserEnabled: false,
    photoVisionPhotoUri: null,
    photoVisionStatus: 'idle',
    profile: EMPTY_PROFILE,
    savedBannerId: null,
    savedReportId: null,
    step: 'start',
  };
}

function updateDraft(state: ReportWizardState, patch: Partial<ReportDraft>): ReportWizardState {
  return { ...state, draft: { ...state.draft, ...patch } };
}

/** Checklist answers belong to one issue, so keep them only while the issue stays the same. */
function answersForCategory(draft: ReportDraft, nextCategoryId: string | null) {
  return nextCategoryId === draft.categoryId ? draft.answers : {};
}

export function reportWizardReducer(
  state: ReportWizardState,
  action: ReportWizardAction
): ReportWizardState {
  switch (action.type) {
    case 'appendDescription':
      return updateDraft(state, { description: action.value });
    case 'backFromCategory':
      return {
        ...state,
        step: state.categoryReturnStep === 'details' ? 'details' : 'start',
      };
    case 'chooseCategory':
      return {
        ...updateDraft(state, {
          answers: answersForCategory(state.draft, action.categoryId),
          categoryId: action.categoryId,
          photoIssueTopic: null,
        }),
        issueSearchQuery: '',
        step: state.categoryReturnStep,
      };
    case 'dismissContactPrompt':
      return { ...state, dismissedContactPrompt: true };
    case 'dismissSavedBanner':
      return { ...state, savedBannerId: null };
    case 'draftCreated':
      return { ...state, savedReportId: state.savedReportId ?? action.reportId };
    case 'openCategory':
      return {
        ...state,
        categoryReturnStep: action.returnStep,
        issueSearchQuery: '',
        step: 'category',
      };
    case 'photoStored': {
      // A new photo invalidates suggestions from the old one, and any issue taken from them.
      const categoryId = state.draft.photoIssueTopic ? null : state.draft.categoryId;
      return {
        ...updateDraft(state, {
          answers: answersForCategory(state.draft, categoryId),
          categoryId,
          photoIssueTopic: null,
          photoUri: action.photoUri,
          photoVisionResult: null,
          thumbnailUri: action.thumbnailUri ?? action.photoUri,
        }),
        photoVisionPhotoUri: null,
        photoVisionStatus: 'idle',
      };
    }
    case 'previewReady':
      return {
        ...state,
        dismissedContactPrompt: false,
        emailBody: action.emailBody,
        emailSubject: action.emailSubject,
        savedReportId: action.savedReportId,
        step: 'preview',
      };
    case 'profileLoaded':
      return {
        ...state,
        emailBody: action.emailBody ?? state.emailBody,
        emailSubject: action.emailSubject ?? state.emailSubject,
        profile: action.profile,
      };
    case 'resetReport':
      return {
        ...createInitialReportWizardState(),
        photoAnalysisUserEnabled: state.photoAnalysisUserEnabled,
        profile: state.profile,
        savedBannerId: action.savedBannerId ?? null,
      };
    case 'resumeReport':
      return {
        ...state,
        draft: draftFromReport(action.report),
        dismissedContactPrompt: false,
        emailBody: action.report.emailBody,
        emailSubject: action.report.emailSubject,
        issueSearchQuery: '',
        photoVisionPhotoUri: action.report.photoVisionResult ? action.report.photoUri : null,
        photoVisionStatus: getPhotoVisionStatus(action.report.photoVisionResult),
        savedBannerId: null,
        savedReportId: action.report.id,
        step: 'details',
      };
    case 'setAddress':
      return updateDraft(state, { address: action.address });
    case 'setAnswer':
      return updateDraft(state, {
        answers: { ...state.draft.answers, [action.questionId]: action.value },
      });
    case 'setBusy':
      return { ...state, busy: action.busy };
    case 'setDescription':
      return updateDraft(state, { description: action.description });
    case 'setEmailBody':
      return { ...state, emailBody: action.emailBody };
    case 'setEmailSubject':
      return { ...state, emailSubject: action.emailSubject };
    case 'setIssueSearchQuery':
      return { ...state, issueSearchQuery: action.issueSearchQuery };
    case 'setLocationNote':
      return updateDraft(state, { locationNote: action.locationNote });
    case 'setPhotoAnalysisUserEnabled':
      return { ...state, photoAnalysisUserEnabled: action.enabled };
    case 'setPhotoVisionError':
      if (action.photoUri !== state.draft.photoUri) return state;
      return {
        ...state,
        photoVisionPhotoUri: action.photoUri,
        photoVisionStatus: getPhotoVisionErrorStatus(action.error),
      };
    case 'setPhotoVisionLoading':
      if (action.photoUri !== state.draft.photoUri) return state;
      return {
        ...state,
        photoVisionPhotoUri: action.photoUri,
        photoVisionStatus: 'loading',
      };
    case 'setPhotoVisionResult':
      if (action.photoUri !== state.draft.photoUri) return state;
      return {
        ...updateDraft(state, { photoVisionResult: action.result }),
        photoVisionPhotoUri: action.photoUri,
        photoVisionStatus: getPhotoVisionStatus(action.result),
      };
    case 'setPinLocation':
      return updateDraft(state, { latitude: action.latitude, longitude: action.longitude });
    case 'setResolvedAddress':
      return updateDraft(state, { address: action.address });
    case 'setStep':
      return { ...state, step: action.step };
    case 'togglePhotoIssueTopic': {
      const deselecting = state.draft.photoIssueTopic?.issueId === action.topic.issueId;
      const categoryId = deselecting ? null : action.topic.issueId;
      return updateDraft(state, {
        answers: answersForCategory(state.draft, categoryId),
        categoryId,
        photoIssueTopic: deselecting ? null : action.topic,
      });
    }
    default:
      return state;
  }
}

export function getPhotoVisionStatus(result: PhotoVisionResult | null): PhotoVisionStatus {
  if (!result) return 'idle';
  return result.issueCandidates.length > 0 ? 'ready' : 'empty';
}

export function getPhotoVisionErrorStatus(error: unknown): PhotoVisionStatus {
  if (error instanceof PhotoVisionError) {
    if (error.code === 'offline') return 'offline';
    if (error.code === 'rate-limited') return 'rate-limited';
    if (error.code === 'payload-too-large') return 'payload-too-large';
  }

  return 'error';
}

export function shouldStartPhotoAnalysis(
  state: Pick<ReportWizardState, 'draft' | 'photoVisionPhotoUri' | 'photoVisionStatus'>,
  photoLabelsEnabled: boolean
) {
  return Boolean(
    photoLabelsEnabled &&
      state.draft.photoUri &&
      state.photoVisionStatus === 'idle' &&
      state.photoVisionPhotoUri !== state.draft.photoUri
  );
}

export function filterIssueCategories(queryValue: string) {
  const query = queryValue.trim().toLowerCase();
  if (!query) return getCommonIssueCategories();

  return ISSUE_CATEGORIES.filter((item) =>
    [item.title, item.subjectLabel, ...item.questions.map((question) => question.label)]
      .join(' ')
      .toLowerCase()
      .includes(query)
  );
}

export function getCommonIssueCategories() {
  return COMMON_ISSUE_CATEGORY_IDS.map((id) =>
    ISSUE_CATEGORIES.find((category) => category.id === id)
  ).filter((category): category is IssueCategory => category != null);
}

export function canContinueFromLocation(
  draft: Pick<ReportDraft, 'address' | 'latitude' | 'longitude'>
) {
  return Boolean(draft.address.trim() || (draft.latitude != null && draft.longitude != null));
}

export function canPreviewReport(
  draft: Pick<ReportDraft, 'address' | 'description' | 'latitude' | 'longitude'>
) {
  return Boolean(draft.description.trim() && canContinueFromLocation(draft));
}

export function profilesEqual(left: Profile, right: Profile) {
  return left.name === right.name && left.email === right.email && left.phone === right.phone;
}
