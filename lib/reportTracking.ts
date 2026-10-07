import type { Report } from './types';

export function getReportTrackingLabel(report: Pick<Report, 'caseNumber' | 'status'>) {
  if (report.status === 'draft') return 'Resume draft';
  if (report.status === 'handed_off' && !report.caseNumber.trim()) return 'Did you send it?';
  if (report.status === 'case_added' || report.caseNumber.trim()) return 'Case number saved';
  return 'Needs case number';
}
