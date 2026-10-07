import { buildShareMessage, describeShareTarget } from '../handoff';

describe('report handoff', () => {
  it('names the app the share sheet handed the report to', () => {
    expect(describeShareTarget('com.google.Gmail.ShareExtension')).toBe('Gmail');
    expect(describeShareTarget('com.microsoft.Office.Outlook.compose-shareextension')).toBe('Outlook');
    expect(describeShareTarget('com.apple.UIKit.activity.Mail')).toBe('Mail');
    expect(describeShareTarget('com.example.unknown')).toBeNull();
    expect(describeShareTarget(null)).toBeNull();
  });

  it('puts the recipient and subject at the top of shared text', () => {
    expect(
      buildShareMessage({ recipient: '311@toronto.ca', subject: 'Pothole', body: 'Body' })
    ).toBe('To: 311@toronto.ca\nSubject: Pothole\n\nBody');
  });
});
