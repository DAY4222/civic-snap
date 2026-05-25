export type ReportStatus = 'Draft' | 'Mail opened' | 'Case added';

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

export type DraftReportInput = {
  category: IssueCategory;
  description: string;
  answers: Record<string, string>;
  address: string;
  locationNote: string;
  latitude: number | null;
  longitude: number | null;
  photoUri: string | null;
  photoIssueTopic?: PhotoIssueCandidate | null;
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

export type Report = {
  id: string;
  categoryId: string | null;
  category: string;
  description: string;
  answers: Record<string, string>;
  address: string;
  latitude: number | null;
  longitude: number | null;
  photoUri: string | null;
  photoVisionResult: PhotoVisionResult | null;
  photoIssueTopic: PhotoIssueCandidate | null;
  emailSubject: string;
  emailBody: string;
  status: ReportStatus;
  caseNumber: string;
  createdAt: string;
  updatedAt: string;
};
