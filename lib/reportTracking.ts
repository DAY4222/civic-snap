import type { Report } from './types';

export function getReportTrackingLabel(report: Pick<Report, 'caseNumber' | 'status'>) {
  if (report.status === 'draft') return 'Resume draft';
  if (report.status === 'handed_off' && !report.caseNumber.trim()) return 'Did you send it?';
  if (report.status === 'case_added' || report.caseNumber.trim()) return 'Case number saved';
  return 'Needs case number';
}

/** Where a report stands, for History's sections and the status chip on each row. */
export type ReportStage = 'draft' | 'sent' | 'case';

export function getReportStage(report: Pick<Report, 'caseNumber' | 'status'>): ReportStage {
  if (report.status === 'draft') return 'draft';
  if (report.status === 'case_added' || report.caseNumber.trim()) return 'case';
  return 'sent';
}

export type StatusChip = { label: string; tone: 'neutral' | 'warning' | 'primary' | 'success' };

export function getStatusChip(report: Pick<Report, 'caseNumber' | 'status'>): StatusChip {
  switch (getReportStage(report)) {
    case 'draft':
      return { label: 'Draft', tone: 'neutral' };
    case 'case':
      return { label: report.caseNumber.trim() ? `Case ${report.caseNumber.trim()}` : 'Case saved', tone: 'success' };
    default:
      // Handed to an email app but never confirmed: the user may not have pressed Send.
      return report.status === 'handed_off'
        ? { label: 'Not confirmed', tone: 'warning' }
        : { label: 'Sent', tone: 'primary' };
  }
}

const STAGE_SECTIONS: { stage: ReportStage; title: string }[] = [
  { stage: 'draft', title: 'Drafts' },
  { stage: 'sent', title: 'Sent' },
  { stage: 'case', title: 'Case number saved' },
];

/**
 * History's sections, in that order, newest first within each: drafts by last edit, the rest
 * by when they were handed off.
 */
export function groupReportsForHistory<
  T extends Pick<Report, 'caseNumber' | 'status' | 'updatedAt' | 'handedOffAt' | 'createdAt'>,
>(reports: T[]) {
  const timeOf = (report: T) =>
    report.status === 'draft' ? report.updatedAt : report.handedOffAt ?? report.createdAt;

  return STAGE_SECTIONS.map(({ stage, title }) => ({
    stage,
    title,
    data: reports
      .filter((report) => getReportStage(report) === stage)
      .sort((a, b) => timeOf(b).localeCompare(timeOf(a))),
  })).filter((section) => section.data.length > 0);
}

/** "Edited 5 minutes ago" for drafts, "Sent 2 hours ago" for the rest. */
export function getReportTimeLabel(
  report: Pick<Report, 'status' | 'updatedAt' | 'handedOffAt' | 'createdAt'>,
  formatTime: (iso: string) => string
) {
  const when =
    report.status === 'draft'
      ? formatTime(report.updatedAt)
      : formatTime(report.handedOffAt ?? report.createdAt);
  return `${report.status === 'draft' ? 'Edited' : 'Sent'} ${lowercaseRelative(when)}`;
}

/** "Yesterday" → "yesterday", but a date like "25 May" keeps its month name. */
export function lowercaseRelative(when: string) {
  return /^\d/.test(when) ? when : when.charAt(0).toLowerCase() + when.slice(1);
}
