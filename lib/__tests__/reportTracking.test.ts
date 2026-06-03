import { getReportTrackingLabel } from '../reportTracking';
import type { Report } from '../types';

const baseReport: Pick<Report, 'caseNumber' | 'status'> = {
  caseNumber: '',
  status: 'Mail opened',
};

describe('report tracking labels', () => {
  it('describes draft, missing case number, and saved case number states', () => {
    expect(getReportTrackingLabel({ ...baseReport, status: 'Draft' })).toBe('Resume draft');
    expect(getReportTrackingLabel(baseReport)).toBe('Needs case number');
    expect(getReportTrackingLabel({ ...baseReport, caseNumber: ' SR-2026-000123 ' })).toBe(
      'Case number saved'
    );
  });
});
