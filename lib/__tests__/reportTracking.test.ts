import { getReportTrackingLabel } from '../reportTracking';
import type { Report } from '../types';

const baseReport: Pick<Report, 'caseNumber' | 'status'> = {
  caseNumber: '',
  status: 'handed_off',
};

describe('report tracking labels', () => {
  it('describes draft, missing case number, and saved case number states', () => {
    expect(getReportTrackingLabel({ ...baseReport, status: 'draft' })).toBe('Resume draft');
    expect(getReportTrackingLabel(baseReport)).toBe('Did you send it?');
    expect(getReportTrackingLabel({ ...baseReport, status: 'sent' })).toBe('Needs case number');
    expect(getReportTrackingLabel({ ...baseReport, caseNumber: ' SR-2026-000123 ' })).toBe(
      'Case number saved'
    );
  });
});
