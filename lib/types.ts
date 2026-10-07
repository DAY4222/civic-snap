/**
 * draft: still being written. handed_off: the mail composer or share sheet opened, but the user
 * hasn't confirmed sending. sent: confirmed sent. case_added: 311's case number was saved.
 */
export type ReportStatus = 'draft' | 'handed_off' | 'sent' | 'case_added';

export type Profile = {
  name: string;
  email: string;
  phone: string;
};

export type CategoryQuestionAnswerType =
  | 'text'
  | 'date'
  | 'time'
  | 'number'
  | 'picklist'
  | 'radio'
  | 'multipicklist';

export type CategoryQuestionOption = {
  label: string;
  value: string;
  isEligibleResponse: boolean | null;
  suggestedLabelIds: string[];
};

export type CategoryQuestion = {
  id: string;
  label: string;
  placeholder: string;
  answerType: CategoryQuestionAnswerType;
  isRequired: boolean;
  sectionName: string;
  options: CategoryQuestionOption[];
};

export type IssueCategorySourceMatchStatus = 'matched' | 'unmatched' | 'ambiguous';
export type IssueDiscoverability = 'photo' | 'limited-context' | 'not-discoverable';
export type PhotoIssueConfidenceTier = 'strong' | 'likely' | 'possible';

export type IssueCategory = {
  id: string;
  title: string;
  subjectLabel: string;
  categoryPath: string[];
  description: string;
  discoverability: IssueDiscoverability;
  sourceMatchStatus?: IssueCategorySourceMatchStatus;
  visualCueLabelIds: string[];
  requiredAnyLabelIds: string[];
  requiredAllLabelIds: string[];
  photoHint?: string;
  suppressionGroup?: string;
  forceConfidenceTier?: PhotoIssueConfidenceTier;
  observations: string[];
  questions: CategoryQuestion[];
  emailGuidanceChecklist: CategoryQuestion[];
};

export type PhotoIssueCandidateBoundingBox = {
  labelId: string;
  label: string;
  boundingBox: PhotoLabelBoundingBox;
};

export type PhotoIssueCandidate = {
  issueId: string;
  title: string;
  confidence: number;
  confidenceTier: PhotoIssueConfidenceTier;
  supportingLabelIds: string[];
  evidenceChips: string[];
  reason: string;
  suggestedDescription: string;
  boundingBoxes: PhotoIssueCandidateBoundingBox[];
};

/** Text answers are strings; single-choice answers store the option label; multi-choice a list of labels. */
export type ReportAnswerValue = string | string[];
export type ReportAnswers = Record<string, ReportAnswerValue>;

/** What the user is drafting. The wizard edits it, and every save writes all of it. */
export type ReportDraft = {
  /** Issue chosen in search or from an accepted photo suggestion; null for a general report. */
  categoryId: string | null;
  /** The photo suggestion the user accepted, when categoryId came from one. */
  photoIssueTopic: PhotoIssueCandidate | null;
  description: string;
  answers: ReportAnswers;
  address: string;
  locationNote: string;
  latitude: number | null;
  longitude: number | null;
  photoUri: string | null;
  thumbnailUri: string | null;
  photoVisionResult: PhotoVisionResult | null;
};

/** Everything an email is built from: the draft, the issue it resolves to, and who is reporting. */
export type EmailInput = ReportDraft & {
  category: IssueCategory;
  profile: Profile;
};

export type PhotoLabelBoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PhotoLabelDefinition = {
  id: string;
  label: string;
  description: string;
};

export type PhotoVisionLabel = {
  id: string;
  label: string;
  confidence: number;
  evidence: string;
  boundingBox?: PhotoLabelBoundingBox;
};

export type PhotoVisionResult = {
  suggestedLabels: PhotoVisionLabel[];
  issueCandidates: PhotoIssueCandidate[];
  provider: 'gemini';
  model: string;
  promptVersion: string;
  taxonomyVersion: string;
  issueCatalogVersion?: string;
  analyzedAt: string;
  latencyMs: number;
  image: {
    width: number;
    height: number;
    bytes: number;
    mimeType: string;
  };
};

export type Report = ReportDraft & {
  id: string;
  /** Issue title when the report was saved, shown in History. */
  category: string;
  emailSubject: string;
  emailBody: string;
  status: ReportStatus;
  caseNumber: string;
  createdAt: string;
  updatedAt: string;
};
