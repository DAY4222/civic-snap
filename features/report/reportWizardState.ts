import type { PhotoAnalysisChoice } from '@/lib/aiSettings';
import { ISSUE_CATEGORIES } from '@/lib/categories';
import { searchIssues, type IssueSearchResult } from '@/lib/issueSearch';
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
  ReportStatus,
} from '@/lib/types';
import { BackendError } from '@/lib/backend/client';

import {
  INITIAL_EMAIL_DRAFT,
  acceptPendingAiEmail,
  dismissPendingAiEmail,
  editEmail,
  emailDraftFromSaved,
  receiveAiEmail,
  undoAiEmail,
  type EmailContent,
  type EmailDraftState,
} from './emailDraft';

export type ReportWizardStep =
  | 'start'
  | 'suggest'
  | 'category'
  | 'location'
  | 'details'
  | 'preview'
  | 'fallback'
  | 'done';

export type LastHandoff = {
  reportId: string;
  status: Extract<ReportStatus, 'handed_off' | 'sent'>;
  /** The app the email went to, when known ("Mail", "Gmail"). */
  app: string | null;
};
export type CategoryReturnStep = 'location' | 'details';
/** The first step of a report: photo suggestions, or the issue search. */
export type IssueStep = 'suggest' | 'category';
/** What the suggest step shows. */
export type SuggestStepMode = 'opt-in' | 'loading' | 'ready' | 'failed';
/** Where the pin came from: the photo's GPS, the phone's location, or the user moving the map. */
export type PinSource = 'photo' | 'device' | 'map';
export type EmailPolishStatus = 'idle' | 'consent' | 'loading' | 'error';
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
  email: EmailDraftState;
  emailPolish: { status: EmailPolishStatus; message: string | null };
  /** The user agreed to send report text (never contact details) for AI email polish. */
  emailPolishEnabled: boolean;
  issueSearchQuery: string;
  issueStep: IssueStep;
  /** Null until settings load; the wizard waits for it before picking the first step. */
  photoAnalysisChoice: PhotoAnalysisChoice | null;
  photoVisionPhotoUri: string | null;
  photoVisionStatus: PhotoVisionStatus;
  pinSource: PinSource | null;
  profile: Profile;
  /** The report just handed off, shown on the done step. */
  lastHandoff: LastHandoff | null;
  savedReportId: string | null;
  step: ReportWizardStep;
};

export type ReportWizardAction =
  | { type: 'appendDescription'; value: string }
  | { type: 'chooseCategory'; categoryId: string | null }
  | { type: 'chooseSuggestedTopic'; topic: PhotoIssueCandidate }
  | { type: 'dismissContactPrompt' }
  | { type: 'draftCreated'; reportId: string }
  | {
      type: 'handoffFinished';
      app: string | null;
      reportId: string;
      status: Extract<ReportStatus, 'handed_off' | 'sent'>;
    }
  | { type: 'openCategory'; returnStep: CategoryReturnStep }
  | { type: 'photoStored'; photoUri: string; thumbnailUri?: string | null }
  | { type: 'previewReady'; savedReportId: string }
  | { type: 'profileLoaded'; profile: Profile }
  | { type: 'handoffConfirmed' }
  | { type: 'resumeReport'; report: Report }
  | { type: 'setAddress'; address: string }
  | { type: 'setAnswer'; questionId: string; value: ReportAnswerValue }
  | { type: 'setBusy'; busy: boolean }
  | { type: 'setDescription'; description: string }
  | { type: 'setIssueSearchQuery'; issueSearchQuery: string }
  | { type: 'setLocationNote'; locationNote: string }
  | { type: 'setPhotoAnalysisChoice'; choice: PhotoAnalysisChoice }
  | { type: 'setPhotoVisionError'; photoUri: string; error: unknown }
  | { type: 'setPhotoVisionLoading'; photoUri: string }
  | { type: 'setPhotoVisionResult'; photoUri: string; result: PhotoVisionResult }
  | { type: 'setPinLocation'; latitude: number; longitude: number; source: PinSource }
  | { type: 'setStep'; step: ReportWizardStep }
  | { type: 'startPhotoPath'; suggest: boolean }
  | { type: 'setResolvedAddress'; address: string }
  | { type: 'togglePhotoIssueTopic'; topic: PhotoIssueCandidate }
  | { type: 'editEmail'; content: EmailContent; generated: EmailContent }
  | { type: 'aiEmailReady'; content: EmailContent; generated: EmailContent }
  | { type: 'acceptPendingAiEmail'; generated: EmailContent }
  | { type: 'dismissPendingAiEmail' }
  | { type: 'undoAiEmail' }
  | { type: 'rebuildEmail' }
  | { type: 'setEmailPolishEnabled'; enabled: boolean }
  | { type: 'emailPolishConsentRequested' }
  | { type: 'emailPolishStarted' }
  | { type: 'emailPolishFinished' }
  | { type: 'emailPolishFailed'; message: string };

export function createInitialReportWizardState(): ReportWizardState {
  return {
    draft: EMPTY_DRAFT,
    busy: false,
    categoryReturnStep: 'location',
    dismissedContactPrompt: false,
    email: INITIAL_EMAIL_DRAFT,
    emailPolish: IDLE_EMAIL_POLISH,
    emailPolishEnabled: false,
    issueSearchQuery: '',
    issueStep: 'category',
    photoAnalysisChoice: null,
    photoVisionPhotoUri: null,
    photoVisionStatus: 'idle',
    pinSource: null,
    profile: EMPTY_PROFILE,
    lastHandoff: null,
    savedReportId: null,
    step: 'start',
  };
}

const IDLE_EMAIL_POLISH: ReportWizardState['emailPolish'] = { status: 'idle', message: null };

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
    case 'chooseSuggestedTopic': {
      const categoryId = action.topic.issueId;
      return {
        ...updateDraft(state, {
          answers: answersForCategory(state.draft, categoryId),
          categoryId,
          photoIssueTopic: action.topic,
        }),
        step: 'location',
      };
    }
    case 'dismissContactPrompt':
      return { ...state, dismissedContactPrompt: true };
    case 'draftCreated':
      return { ...state, savedReportId: state.savedReportId ?? action.reportId };
    case 'handoffFinished':
      return {
        ...createInitialReportWizardState(),
        emailPolishEnabled: state.emailPolishEnabled,
        photoAnalysisChoice: state.photoAnalysisChoice,
        lastHandoff: { app: action.app, reportId: action.reportId, status: action.status },
        profile: state.profile,
        step: 'done',
      };
    case 'handoffConfirmed':
      return state.lastHandoff
        ? { ...state, lastHandoff: { ...state.lastHandoff, status: 'sent' } }
        : state;
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
      return { ...state, savedReportId: action.savedReportId, step: 'preview' };
    case 'profileLoaded':
      return { ...state, profile: action.profile };
    case 'resumeReport':
      return {
        ...state,
        draft: draftFromReport(action.report),
        dismissedContactPrompt: false,
        email: emailDraftFromSaved(action.report.emailSource, {
          subject: action.report.emailSubject,
          body: action.report.emailBody,
        }),
        issueSearchQuery: '',
        photoVisionPhotoUri: action.report.photoVisionResult ? action.report.photoUri : null,
        photoVisionStatus: getPhotoVisionStatus(action.report.photoVisionResult),
        issueStep: action.report.photoVisionResult ? 'suggest' : 'category',
        lastHandoff: null,
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
    case 'setIssueSearchQuery':
      return { ...state, issueSearchQuery: action.issueSearchQuery };
    case 'setLocationNote':
      return updateDraft(state, { locationNote: action.locationNote });
    case 'setPhotoAnalysisChoice':
      return { ...state, photoAnalysisChoice: action.choice };
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
      return {
        ...updateDraft(state, { latitude: action.latitude, longitude: action.longitude }),
        pinSource: action.source,
      };
    case 'setResolvedAddress':
      return updateDraft(state, { address: action.address });
    case 'setStep':
      return { ...state, step: action.step };
    case 'startPhotoPath':
      return action.suggest
        ? { ...state, issueStep: 'suggest', step: 'suggest' }
        : {
            ...state,
            categoryReturnStep: 'location',
            issueSearchQuery: '',
            issueStep: 'category',
            step: 'category',
          };
    case 'togglePhotoIssueTopic': {
      const deselecting = state.draft.photoIssueTopic?.issueId === action.topic.issueId;
      const categoryId = deselecting ? null : action.topic.issueId;
      return updateDraft(state, {
        answers: answersForCategory(state.draft, categoryId),
        categoryId,
        photoIssueTopic: deselecting ? null : action.topic,
      });
    }
    case 'editEmail':
      return { ...state, email: editEmail(action.content, action.generated) };
    case 'aiEmailReady':
      return {
        ...state,
        email: receiveAiEmail(state.email, action.content, action.generated),
        emailPolish: IDLE_EMAIL_POLISH,
      };
    case 'acceptPendingAiEmail':
      return { ...state, email: acceptPendingAiEmail(state.email, action.generated) };
    case 'dismissPendingAiEmail':
      return { ...state, email: dismissPendingAiEmail(state.email) };
    case 'undoAiEmail':
      return { ...state, email: undoAiEmail(state.email) };
    case 'rebuildEmail':
      return { ...state, email: INITIAL_EMAIL_DRAFT };
    case 'setEmailPolishEnabled':
      return { ...state, emailPolishEnabled: action.enabled };
    case 'emailPolishConsentRequested':
      return { ...state, emailPolish: { status: 'consent', message: null } };
    case 'emailPolishStarted':
      return { ...state, emailPolish: { status: 'loading', message: null } };
    case 'emailPolishFinished':
      return { ...state, emailPolish: IDLE_EMAIL_POLISH };
    case 'emailPolishFailed':
      return { ...state, emailPolish: { status: 'error', message: action.message } };
    default:
      return state;
  }
}

export function getPhotoVisionStatus(result: PhotoVisionResult | null): PhotoVisionStatus {
  if (!result) return 'idle';
  return result.issueCandidates.length > 0 ? 'ready' : 'empty';
}

export function getPhotoVisionErrorStatus(error: unknown): PhotoVisionStatus {
  if (error instanceof BackendError) {
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

/** Common issues for an empty search; ranked matches and "report elsewhere" cards otherwise. */
export function searchIssueCategories(query: string): IssueSearchResult {
  if (!query.trim()) return { categories: getCommonIssueCategories(), redirects: [] };
  return searchIssues(query);
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

export function describeEmailPolishError(error: unknown) {
  const code = error instanceof BackendError ? error.code : null;
  if (code === 'rate-limited') {
    return "AI polish has reached today's limit. Your email is ready to send as it is.";
  }
  if (code === 'offline') {
    return "AI polish can't connect right now. Your email is ready to send as it is.";
  }
  if (code === 'timeout') {
    return 'AI polish took too long. Try again, or send the email as it is.';
  }
  return "AI polish didn't work this time. Your email is ready to send as it is.";
}

/** Where Back goes from each step; null means Back leaves the wizard. */
export function getPreviousStep(
  state: Pick<ReportWizardState, 'step' | 'categoryReturnStep' | 'issueStep'>
): ReportWizardStep | null {
  switch (state.step) {
    case 'category':
      if (state.categoryReturnStep === 'details') return 'details';
      // The search opened from the suggest step goes back to the suggestions.
      return state.issueStep === 'suggest' ? 'suggest' : null;
    case 'location':
      return state.issueStep;
    case 'details':
      return 'location';
    case 'preview':
      return 'details';
    case 'fallback':
      return 'preview';
    default:
      return null;
  }
}

/** Which of the four progress-tracker steps is lit for the current wizard step. */
export function getTrackerIndex(state: Pick<ReportWizardState, 'step' | 'categoryReturnStep'>) {
  switch (state.step) {
    case 'suggest':
      return 0;
    case 'category':
      return state.categoryReturnStep === 'details' ? 2 : 0;
    case 'location':
      return 1;
    case 'details':
      return 2;
    case 'preview':
    case 'fallback':
      return 3;
    default:
      return 0;
  }
}

const FAILED_PHOTO_VISION_STATUSES: PhotoVisionStatus[] = [
  'empty',
  'error',
  'offline',
  'rate-limited',
  'payload-too-large',
];

export function isPhotoVisionFailure(status: PhotoVisionStatus) {
  return FAILED_PHOTO_VISION_STATUSES.includes(status);
}

/** The suggest step asks first, then waits for the photo check, then shows its result. */
export function getSuggestStepMode(
  state: Pick<ReportWizardState, 'photoAnalysisChoice' | 'photoVisionStatus'>
): SuggestStepMode {
  if (state.photoAnalysisChoice !== 'on') return 'opt-in';
  if (state.photoVisionStatus === 'ready') return 'ready';
  if (isPhotoVisionFailure(state.photoVisionStatus)) return 'failed';
  return 'loading';
}
