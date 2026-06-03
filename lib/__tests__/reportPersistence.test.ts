import {
  getMissingReportColumnMigrations,
  parseAnswers,
  parsePhotoIssueTopic,
  parseReportStatus,
  rowToReport,
} from '../reportPersistence';
import type { ReportRow } from '../reportPersistence';

const baseRow: ReportRow = {
  id: 'report-1',
  category_id: null,
  category: 'Road Pothole / Road Damage',
  description: 'Pothole in road.',
  answers_json: '{"q1":"yes","q2":2}',
  address: '123 Queen St W',
  latitude: 43.65,
  longitude: -79.38,
  photo_uri: null,
  thumbnail_uri: null,
  photo_vision_result_json: null,
  photo_issue_topic_json: null,
  email_subject: 'Subject',
  email_body: 'Body',
  status: 'Definitely sent',
  case_number: '',
  created_at: '2026-05-20T00:00:00.000Z',
  updated_at: '2026-05-20T00:00:00.000Z',
};

describe('report persistence helpers', () => {
  it('plans only missing prototype column backfills', () => {
    expect(getMissingReportColumnMigrations(['id', 'category_id'])).toEqual([
      'ALTER TABLE reports ADD COLUMN thumbnail_uri TEXT;',
      'ALTER TABLE reports ADD COLUMN photo_vision_result_json TEXT;',
      'ALTER TABLE reports ADD COLUMN photo_issue_topic_json TEXT;',
    ]);
  });

  it('keeps malformed answers from escaping storage parsing', () => {
    expect(parseAnswers('{"a":"one","b":2,"c":false}')).toEqual({ a: 'one' });
    expect(parseAnswers('not json')).toEqual({});
    expect(parseAnswers('["nope"]')).toEqual({});
  });

  it('maps legacy rows safely into reports', () => {
    const report = rowToReport(baseRow);

    expect(report.categoryId).toBe('road-pothole-road-damage');
    expect(report.answers).toEqual({ q1: 'yes' });
    expect(report.status).toBe('Draft');
  });

  it('drops malformed stored coordinates instead of leaking NaN into reports', () => {
    const report = rowToReport({
      ...baseRow,
      latitude: 'not-a-number' as unknown as number,
      longitude: Number.NaN,
    });

    expect(report.latitude).toBeNull();
    expect(report.longitude).toBeNull();
  });

  it('normalizes status and photo topic JSON', () => {
    expect(parseReportStatus('Case added')).toBe('Case added');
    expect(parseReportStatus('unknown')).toBe('Draft');
    expect(parsePhotoIssueTopic('not json')).toBeNull();
    expect(
      parsePhotoIssueTopic(
        JSON.stringify({
          issueId: 'road-pothole-road-damage',
          title: 'Road Pothole / Road Damage',
          confidenceTier: 'surprise',
          supportingLabelIds: ['road-pothole', 1],
          evidenceChips: ['Road pothole', false],
        })
      )
    ).toMatchObject({
      confidenceTier: 'possible',
      evidenceChips: ['Road pothole'],
      supportingLabelIds: ['road-pothole'],
    });
  });
});
