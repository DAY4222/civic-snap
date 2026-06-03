import type { Report } from './types';

export function getReportTrackingLabel(report: Pick<Report, 'caseNumber' | 'status'>) {
  if (report.status === 'Draft') return 'Resume draft';
  return report.caseNumber.trim() ? 'Case number saved' : 'Needs case number';
}
