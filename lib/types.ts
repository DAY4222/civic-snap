export type ReportStatus = 'Draft' | 'Mail opened' | 'Case added';

export type Profile = {
  name: string;
  email: string;
  phone: string;
};

export type CategoryQuestion = {
  id: string;
  label: string;
  placeholder: string;
};

export type IssueCategory = {
  id: string;
  title: string;
  subjectLabel: string;
  observations: string[];
  questions: CategoryQuestion[];
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
  profile: Profile;
};

export type Report = {
  id: string;
  category: string;
  description: string;
  answers: Record<string, string>;
  address: string;
  latitude: number | null;
  longitude: number | null;
  photoUri: string | null;
  emailSubject: string;
  emailBody: string;
  status: ReportStatus;
  caseNumber: string;
  createdAt: string;
  updatedAt: string;
};
