import { ISSUE_CATEGORIES, getCategory } from '@/lib/categories';
import { EMPTY_PROFILE } from '@/lib/profile';
import {
  IssueCategory,
  PhotoIssueCandidate,
  PhotoVisionResult,
  Profile,
  Report,
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
  | 'rate-limited'
  | 'payload-too-large';

export const GENERAL_CATEGORY: IssueCategory = {
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

export type ReportWizardState = {
  address: string;
  answers: Record<string, string>;
  busy: boolean;
  categoryReturnStep: CategoryReturnStep;
  description: string;
  dismissedContactPrompt: boolean;
  emailBody: string;
  emailSubject: string;
  issueSearchQuery: string;
  latitude: number | null;
  locationNote: string;
  longitude: number | null;
  photoAnalysisUserEnabled: boolean;
  thumbnailUri: string | null;
  photoUri: string | null;
  photoVisionPhotoUri: string | null;
  photoVisionResult: PhotoVisionResult | null;
  photoVisionStatus: PhotoVisionStatus;
  profile: Profile;
  resumedReportId: string | null;
  savedBannerId: string | null;
  savedReportId: string | null;
  selectedCategoryId: string | null;
  selectedPhotoIssueTopic: PhotoIssueCandidate | null;
  step: ReportWizardStep;
};

export type ReportWizardAction =
  | { type: 'appendDescription'; value: string }
  | { type: 'backFromCategory' }
  | { type: 'chooseCategory'; categoryId: string | null }
  | { type: 'dismissContactPrompt' }
  | { type: 'openCategory'; returnStep: CategoryReturnStep }
  | { type: 'photoStored'; photoUri: string; thumbnailUri?: string | null }
  | { type: 'previewReady'; emailBody: string; emailSubject: string; savedReportId: string }
  | { type: 'profileLoaded'; profile: Profile; emailBody?: string; emailSubject?: string }
  | { type: 'resetReport'; savedBannerId?: string | null }
  | { type: 'resumeReport'; report: Report }
  | { type: 'setAddress'; address: string }
  | { type: 'setAnswer'; questionId: string; value: string }
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
    address: '',
    answers: {},
    busy: false,
    categoryReturnStep: 'location',
    description: '',
    dismissedContactPrompt: false,
    emailBody: '',
    emailSubject: '',
    issueSearchQuery: '',
    latitude: null,
    locationNote: '',
    longitude: null,
    photoAnalysisUserEnabled: false,
    thumbnailUri: null,
    photoUri: null,
    photoVisionPhotoUri: null,
    photoVisionResult: null,
    photoVisionStatus: 'idle',
    profile: EMPTY_PROFILE,
    resumedReportId: null,
    savedBannerId: null,
    savedReportId: null,
    selectedCategoryId: null,
    selectedPhotoIssueTopic: null,
    step: 'start',
  };
}

export function reportWizardReducer(
  state: ReportWizardState,
  action: ReportWizardAction
): ReportWizardState {
  switch (action.type) {
    case 'appendDescription':
      return { ...state, description: action.value };
    case 'backFromCategory':
      return {
        ...state,
        step: state.categoryReturnStep === 'details' ? 'details' : 'start',
      };
    case 'chooseCategory':
      return {
        ...state,
        answers: {},
        issueSearchQuery: '',
        selectedCategoryId: action.categoryId,
        selectedPhotoIssueTopic: null,
        step: state.categoryReturnStep,
      };
    case 'dismissContactPrompt':
      return { ...state, dismissedContactPrompt: true };
    case 'openCategory':
      return {
        ...state,
        categoryReturnStep: action.returnStep,
        issueSearchQuery: '',
        step: 'category',
      };
    case 'photoStored':
      return {
        ...state,
        photoUri: action.photoUri,
        thumbnailUri: action.thumbnailUri ?? action.photoUri,
        photoVisionPhotoUri: null,
        photoVisionResult: null,
        photoVisionStatus: 'idle',
        selectedPhotoIssueTopic: null,
      };
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
        address: action.report.address,
        answers: action.report.answers,
        description: action.report.description,
        dismissedContactPrompt: false,
        emailBody: action.report.emailBody,
        emailSubject: action.report.emailSubject,
        issueSearchQuery: '',
        latitude: action.report.latitude,
        locationNote: '',
        longitude: action.report.longitude,
        photoUri: action.report.photoUri,
        thumbnailUri: action.report.thumbnailUri,
        photoVisionPhotoUri: action.report.photoVisionResult ? action.report.photoUri : null,
        photoVisionResult: action.report.photoVisionResult,
        photoVisionStatus: getPhotoVisionStatus(action.report.photoVisionResult),
        resumedReportId: action.report.id,
        savedBannerId: null,
        savedReportId: action.report.id,
        selectedCategoryId: action.report.photoIssueTopic ? null : action.report.categoryId,
        selectedPhotoIssueTopic: action.report.photoIssueTopic,
        step: 'details',
      };
    case 'setAddress':
      return { ...state, address: action.address };
    case 'setAnswer':
      return {
        ...state,
        answers: { ...state.answers, [action.questionId]: action.value },
      };
    case 'setBusy':
      return { ...state, busy: action.busy };
    case 'setDescription':
      return { ...state, description: action.description };
    case 'setEmailBody':
      return { ...state, emailBody: action.emailBody };
    case 'setEmailSubject':
      return { ...state, emailSubject: action.emailSubject };
    case 'setIssueSearchQuery':
      return { ...state, issueSearchQuery: action.issueSearchQuery };
    case 'setLocationNote':
      return { ...state, locationNote: action.locationNote };
    case 'setPhotoAnalysisUserEnabled':
      return { ...state, photoAnalysisUserEnabled: action.enabled };
    case 'setPhotoVisionError':
      if (action.photoUri !== state.photoUri) return state;
      return {
        ...state,
        photoVisionPhotoUri: action.photoUri,
        photoVisionStatus: getPhotoVisionErrorStatus(action.error),
      };
    case 'setPhotoVisionLoading':
      if (action.photoUri !== state.photoUri) return state;
      return {
        ...state,
        photoVisionPhotoUri: action.photoUri,
        photoVisionStatus: 'loading',
      };
    case 'setPhotoVisionResult':
      if (action.photoUri !== state.photoUri) return state;
      return {
        ...state,
        photoVisionPhotoUri: action.photoUri,
        photoVisionResult: action.result,
        photoVisionStatus: getPhotoVisionStatus(action.result),
      };
    case 'setPinLocation':
      return {
        ...state,
        latitude: action.latitude,
        longitude: action.longitude,
      };
    case 'setResolvedAddress':
      return { ...state, address: action.address };
    case 'setStep':
      return { ...state, step: action.step };
    case 'togglePhotoIssueTopic': {
      const selected =
        state.selectedPhotoIssueTopic?.issueId === action.topic.issueId ? null : action.topic;
      return {
        ...state,
        answers: {},
        selectedCategoryId: null,
        selectedPhotoIssueTopic: selected,
      };
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
    if (error.code === 'rate-limited') return 'rate-limited';
    if (error.code === 'payload-too-large') return 'payload-too-large';
  }

  return 'error';
}

export function shouldStartPhotoAnalysis(
  state: Pick<ReportWizardState, 'photoUri' | 'photoVisionPhotoUri' | 'photoVisionStatus'>,
  photoLabelsEnabled: boolean
) {
  return Boolean(
    photoLabelsEnabled &&
      state.photoUri &&
      state.photoVisionStatus === 'idle' &&
      state.photoVisionPhotoUri !== state.photoUri
  );
}

export function getWizardCategory(state: ReportWizardState) {
  const manualCategory = state.selectedCategoryId ? getCategory(state.selectedCategoryId) : null;
  const photoIssueCategory = state.selectedPhotoIssueTopic
    ? getCategory(state.selectedPhotoIssueTopic.issueId)
    : null;

  return {
    category: manualCategory ?? photoIssueCategory ?? GENERAL_CATEGORY,
    manualCategory,
    photoIssueCategory,
  };
}

export function filterIssueCategories(queryValue: string) {
  const query = queryValue.trim().toLowerCase();
  if (!query) return ISSUE_CATEGORIES;

  return ISSUE_CATEGORIES.filter((item) =>
    [item.title, item.subjectLabel, ...item.questions.map((question) => question.label)]
      .join(' ')
      .toLowerCase()
      .includes(query)
  );
}

export function profilesEqual(left: Profile, right: Profile) {
  return left.name === right.name && left.email === right.email && left.phone === right.phone;
}
