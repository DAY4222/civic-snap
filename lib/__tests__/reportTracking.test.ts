import {
  getReportStage,
  getReportTimeLabel,
  getReportTrackingLabel,
  getStatusChip,
  groupReportsForHistory,
} from '../reportTracking';
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

function row(
  id: string,
  status: Report['status'],
  times: { updated?: string; handedOff?: string | null } = {},
  caseNumber = ''
) {
  return {
    id,
    status,
    caseNumber,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: times.updated ?? '2026-10-01T00:00:00.000Z',
    handedOffAt: times.handedOff ?? null,
  };
}

describe('History grouping', () => {
  it('puts drafts, sent reports and reports with a case number in their own sections', () => {
    const sections = groupReportsForHistory([
      row('sent-old', 'sent', { handedOff: '2026-10-02T00:00:00.000Z' }),
      row('draft-new', 'draft', { updated: '2026-10-05T00:00:00.000Z' }),
      row('case', 'case_added', {}, 'SR-1'),
      row('sent-new', 'handed_off', { handedOff: '2026-10-04T00:00:00.000Z' }),
      row('draft-old', 'draft', { updated: '2026-10-03T00:00:00.000Z' }),
    ]);

    expect(sections.map((section) => [section.title, section.data.map((item) => item.id)])).toEqual([
      ['Drafts', ['draft-new', 'draft-old']],
      ['Sent', ['sent-new', 'sent-old']],
      ['Case number saved', ['case']],
    ]);
  });

  it('labels each report with a chip and a time', () => {
    expect(getStatusChip(row('a', 'draft'))).toEqual({ label: 'Draft', tone: 'neutral' });
    expect(getStatusChip(row('b', 'handed_off'))).toEqual({ label: 'Not confirmed', tone: 'warning' });
    expect(getStatusChip(row('c', 'sent'))).toEqual({ label: 'Sent', tone: 'primary' });
    expect(getStatusChip(row('d', 'sent', {}, ' SR-9 '))).toEqual({ label: 'Case SR-9', tone: 'success' });
    expect(getReportStage(row('e', 'case_added'))).toBe('case');

    const format = () => 'Yesterday';
    expect(getReportTimeLabel(row('f', 'draft'), format)).toBe('Edited yesterday');
    expect(getReportTimeLabel(row('h', 'draft'), () => '25 May')).toBe('Edited 25 May');
    expect(getReportTimeLabel(row('g', 'sent', { handedOff: '2026-10-05T00:00:00.000Z' }), format)).toBe(
      'Sent yesterday'
    );
  });
});
