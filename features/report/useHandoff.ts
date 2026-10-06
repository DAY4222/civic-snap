import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState } from 'react';
import { Alert, Linking } from 'react-native';

import { markReportHandedOff, markReportSent } from '@/lib/reports';

import { handOffReport, isMailComposerAvailable } from './reportWizardServices';
import type { useDraftPersistence } from './useDraftPersistence';
import type { WizardStore } from './wizardTypes';

type Email = { recipient: string; subject: string; body: string };
type Persistence = ReturnType<typeof useDraftPersistence>;

/** Sending: Apple Mail or the share sheet, the web fallback, and confirming it was sent. */
export function useHandoff({ state, dispatch }: WizardStore, email: Email, persistence: Persistence) {
  const usedMailto = useRef(false);
  const [mailComposerAvailable, setMailComposerAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    if (state.step !== 'preview') return;

    let active = true;
    isMailComposerAvailable().then((available) => {
      if (active) setMailComposerAvailable(available);
    });
    return () => {
      active = false;
    };
  }, [state.step]);

  async function sendReport() {
    const reportId = state.savedReportId;
    if (!reportId) return;

    dispatch({ type: 'setBusy', busy: true });
    try {
      await persistence.flush();
      const outcome = await handOffReport({
        emailBody: email.body,
        emailRecipient: email.recipient,
        emailSubject: email.subject,
        photoUri: state.draft.photoUri,
        reportId,
      });
      if (outcome.kind === 'cancelled') return;
      if (outcome.kind === 'unavailable') {
        dispatch({ type: 'setStep', step: 'fallback' });
        return;
      }

      persistence.detach();
      dispatch({
        type: 'handoffFinished',
        app: outcome.app,
        reportId,
        status: outcome.kind === 'sent' ? 'sent' : 'handed_off',
      });
    } catch {
      dispatch({ type: 'setStep', step: 'fallback' });
      Alert.alert("Couldn't open your email", 'Copy the email instead, or open it in your email app.');
    } finally {
      dispatch({ type: 'setBusy', busy: false });
    }
  }

  /** From the fallback screen, once the user has sent the email themselves. */
  async function confirmSentManually() {
    const reportId = state.savedReportId;
    if (!reportId) return;

    try {
      await persistence.flush();
      await markReportHandedOff(reportId, {
        app: null,
        method: usedMailto.current ? 'mailto' : 'copy',
        status: 'sent',
      });
      persistence.detach();
      dispatch({ type: 'handoffFinished', app: null, reportId, status: 'sent' });
    } catch {
      Alert.alert('Not saved', 'Try again in a moment.');
    }
  }

  /** From the done screen, after handing off to another app. */
  async function confirmLastHandoffSent() {
    const reportId = state.lastHandoff?.reportId;
    if (!reportId) return;

    try {
      await markReportSent(reportId);
      dispatch({ type: 'handoffConfirmed' });
    } catch {
      Alert.alert('Not saved', 'Try again in a moment.');
    }
  }

  return {
    mailComposerAvailable,
    actions: {
      sendReport,
      confirmSentManually,
      confirmLastHandoffSent,
      copyEmail: async () => {
        await Clipboard.setStringAsync(`${email.subject}\n\n${email.body}`);
        Alert.alert('Copied', 'Email subject and body copied.');
      },
      copyRecipient: async () => {
        await Clipboard.setStringAsync(email.recipient);
        Alert.alert('Copied', `${email.recipient} copied.`);
      },
      openMailto: () => {
        usedMailto.current = true;
        const url = `mailto:${email.recipient}?subject=${encodeURIComponent(
          email.subject
        )}&body=${encodeURIComponent(email.body)}`;
        Linking.openURL(url).catch(() => undefined);
      },
    },
  };
}
