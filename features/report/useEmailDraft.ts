import { useEffect, useMemo, useRef } from 'react';

import { saveEmailPolishEnabled } from '@/lib/aiSettings';
import { buildEmail } from '@/lib/email';
import { canRewriteEmailDraft } from '@/lib/emailRewriteClient';
import type { IssueCategory } from '@/lib/types';

import { getDisplayedEmail, isEmailOutOfDate } from './emailDraft';
import { describeEmailPolishError } from './reportWizardState';
import { requestPolishedEmail } from './reportWizardServices';
import type { WizardStore } from './wizardTypes';

/**
 * The email shown on the preview. The generated email always reflects the report; user edits
 * and AI versions live in state.email, and AI polish runs only when the user asks for it.
 */
export function useEmailDraft({ state, dispatch }: WizardStore, category: IssueCategory) {
  const { draft } = state;
  const polishAbortController = useRef<AbortController | null>(null);
  const polishAvailable = canRewriteEmailDraft();

  const generatedEmail = useMemo(
    () => buildEmail({ ...draft, category, profile: state.profile }),
    [category, draft, state.profile]
  );
  const email = useMemo(
    () => ({
      ...getDisplayedEmail(state.email, generatedEmail),
      recipient: generatedEmail.recipient,
      source: state.email.source,
    }),
    [generatedEmail, state.email]
  );

  useEffect(() => {
    // Leaving the preview cancels a polish that is still running.
    if (state.step === 'preview' || !polishAbortController.current) return;

    polishAbortController.current.abort();
    polishAbortController.current = null;
    dispatch({ type: 'emailPolishFinished' });
  }, [dispatch, state.step]);

  useEffect(() => () => polishAbortController.current?.abort(), []);

  async function runPolish() {
    polishAbortController.current?.abort();
    const controller = new AbortController();
    polishAbortController.current = controller;

    dispatch({ type: 'emailPolishStarted' });
    try {
      const content = await requestPolishedEmail(
        { ...draft, category, profile: state.profile },
        { signal: controller.signal }
      );
      if (controller.signal.aborted) return;
      dispatch({ type: 'aiEmailReady', content, generated: generatedEmail });
    } catch (error) {
      if (controller.signal.aborted) return;
      dispatch({ type: 'emailPolishFailed', message: describeEmailPolishError(error) });
    } finally {
      if (polishAbortController.current === controller) polishAbortController.current = null;
    }
  }

  return {
    email,
    emailOutOfDate: isEmailOutOfDate(state.email, generatedEmail),
    polishAvailable,
    actions: {
      setEmailBody: (body: string) =>
        dispatch({ type: 'editEmail', content: { subject: email.subject, body }, generated: generatedEmail }),
      setEmailSubject: (subject: string) =>
        dispatch({ type: 'editEmail', content: { subject, body: email.body }, generated: generatedEmail }),
      rebuildEmail: () => dispatch({ type: 'rebuildEmail' }),
      polishEmail: () => {
        if (!polishAvailable) return;
        if (!state.emailPolishEnabled) {
          dispatch({ type: 'emailPolishConsentRequested' });
          return;
        }
        void runPolish();
      },
      allowEmailPolish: () => {
        dispatch({ type: 'setEmailPolishEnabled', enabled: true });
        saveEmailPolishEnabled(true).catch(() => undefined);
        void runPolish();
      },
      cancelEmailPolish: () => {
        polishAbortController.current?.abort();
        polishAbortController.current = null;
        dispatch({ type: 'emailPolishFinished' });
      },
      dismissEmailPolishConsent: () => dispatch({ type: 'emailPolishFinished' }),
      undoAiEmail: () => dispatch({ type: 'undoAiEmail' }),
      acceptPendingAiEmail: () => dispatch({ type: 'acceptPendingAiEmail', generated: generatedEmail }),
      dismissPendingAiEmail: () => dispatch({ type: 'dismissPendingAiEmail' }),
    },
  };
}
