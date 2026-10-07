import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { isDraftEmpty } from '@/lib/reportDraft';
import { createDraftReport, updateDraftReport } from '@/lib/reports';
import type { EmailSource, IssueCategory, ReportDraft } from '@/lib/types';

import { toCreateReportInput } from './reportWizardServices';

const AUTOSAVE_DELAY_MS = 600;

type DraftPersistenceOptions = {
  category: IssueCategory;
  draft: ReportDraft;
  email: { subject: string; body: string; source: EmailSource };
  /** False when there is nothing to keep, e.g. on the start screen or after the handoff. */
  enabled: boolean;
  onCreated: (reportId: string) => void;
  savedReportId: string | null;
};

/**
 * Saves the draft as the user goes: the row is created as soon as the draft has content, then
 * updated a moment after each change, and immediately when the app is backgrounded. Saves run
 * one at a time so they can't land out of order.
 */
export function useDraftPersistence(options: DraftPersistenceOptions) {
  const latest = useRef(options);
  latest.current = options;

  const savedReportId = useRef(options.savedReportId);
  const queue = useRef<Promise<string | null>>(Promise.resolve(options.savedReportId));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Bumped when the wizard leaves this draft, so a save still in flight can't attach its
  // result to the next report.
  const generation = useRef(0);

  useEffect(() => {
    savedReportId.current = options.savedReportId;
  }, [options.savedReportId]);

  const saveNow = useCallback(() => {
    const saveGeneration = generation.current;

    queue.current = queue.current
      .then(async () => {
        const { category, draft, email, enabled } = latest.current;
        const reportId = savedReportId.current;
        if (saveGeneration !== generation.current || !enabled || isDraftEmpty(draft)) {
          return reportId;
        }

        const input = toCreateReportInput(draft, category, email);
        if (reportId) {
          await updateDraftReport(reportId, input);
          return reportId;
        }

        const createdId = await createDraftReport(input);
        if (saveGeneration === generation.current) {
          savedReportId.current = createdId;
          latest.current.onCreated(createdId);
        }
        return createdId;
      })
      // A failed save is retried by the next change; keep the queue usable.
      .catch(() => savedReportId.current);

    return queue.current;
  }, []);

  const clearTimer = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  /** Saves any pending change now and resolves with the report id (null if nothing to save). */
  const flush = useCallback(() => {
    clearTimer();
    return saveNow();
  }, [clearTimer, saveNow]);

  /** Stops saving this draft; call before resetting the wizard or after the handoff. */
  const detach = useCallback(() => {
    clearTimer();
    generation.current += 1;
    savedReportId.current = null;
  }, [clearTimer]);

  const { draft, email, enabled } = options;
  useEffect(() => {
    if (!enabled || isDraftEmpty(draft)) return;

    clearTimer();
    timer.current = setTimeout(() => {
      timer.current = null;
      void saveNow();
    }, AUTOSAVE_DELAY_MS);

    return clearTimer;
  }, [clearTimer, draft, email.body, email.source, email.subject, enabled, saveNow]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') void flush();
    });
    return () => subscription.remove();
  }, [flush]);

  return { detach, flush };
}
