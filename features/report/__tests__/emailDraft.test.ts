import {
  INITIAL_EMAIL_DRAFT,
  acceptPendingAiEmail,
  dismissPendingAiEmail,
  editEmail,
  emailDraftFromSaved,
  getDisplayedEmail,
  isEmailOutOfDate,
  receiveAiEmail,
  undoAiEmail,
} from '../emailDraft';

const generated = { subject: '311 service request: Pothole', body: 'Generated body' };
const changedReport = { subject: '311 service request: Pothole', body: 'Generated body, updated' };
const ai = { subject: generated.subject, body: 'Polished body' };

describe('email draft state', () => {
  it('shows the generated email until something replaces it', () => {
    expect(getDisplayedEmail(INITIAL_EMAIL_DRAFT, generated)).toBe(generated);
    expect(getDisplayedEmail(INITIAL_EMAIL_DRAFT, changedReport)).toBe(changedReport);
    expect(isEmailOutOfDate(INITIAL_EMAIL_DRAFT, changedReport)).toBe(false);
  });

  it('keeps user edits and flags them when the report changes afterwards', () => {
    const edited = editEmail({ ...generated, body: 'My own words' }, generated);

    expect(getDisplayedEmail(edited, generated).body).toBe('My own words');
    expect(isEmailOutOfDate(edited, generated)).toBe(false);
    expect(getDisplayedEmail(edited, changedReport).body).toBe('My own words');
    expect(isEmailOutOfDate(edited, changedReport)).toBe(true);
  });

  it('applies an AI version over the generated email and can undo it', () => {
    const polished = receiveAiEmail(INITIAL_EMAIL_DRAFT, ai, generated);

    expect(polished.source).toBe('ai');
    expect(getDisplayedEmail(polished, generated).body).toBe('Polished body');

    const undone = undoAiEmail(polished);
    expect(undone.source).toBe('generated');
    expect(getDisplayedEmail(undone, generated)).toBe(generated);
  });

  it('holds an AI version for the user to choose when they already edited the email', () => {
    const edited = editEmail({ ...generated, body: 'My own words' }, generated);
    const waiting = receiveAiEmail(edited, ai, generated);

    expect(getDisplayedEmail(waiting, generated).body).toBe('My own words');
    expect(waiting.pendingAi).toEqual(ai);

    const replaced = acceptPendingAiEmail(waiting, generated);
    expect(getDisplayedEmail(replaced, generated).body).toBe('Polished body');
    expect(getDisplayedEmail(undoAiEmail(replaced), generated).body).toBe('My own words');

    expect(dismissPendingAiEmail(waiting).pendingAi).toBeNull();
  });

  it('restores a saved draft email by its source', () => {
    expect(emailDraftFromSaved('generated', ai)).toEqual(INITIAL_EMAIL_DRAFT);

    const restored = emailDraftFromSaved('user', { ...generated, body: 'Saved edit' });
    expect(getDisplayedEmail(restored, changedReport).body).toBe('Saved edit');
    expect(isEmailOutOfDate(restored, changedReport)).toBe(false);
  });
});
