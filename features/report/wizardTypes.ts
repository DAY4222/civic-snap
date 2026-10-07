import type { Dispatch } from 'react';
import { Linking } from 'react-native';

import type { ReportWizardAction, ReportWizardState } from './reportWizardState';

/** Route params for /report/new: a picked photo, a draft to resume, or a manual start. */
export type ReportWizardParams = {
  photo?: string;
  /** The photo's GPS position, as decimal strings, when it has one. */
  photoLat?: string;
  photoLng?: string;
  photoSource?: 'camera' | 'library';
  resumeId?: string;
  start?: 'manual';
};

/** What every wizard hook gets: the current state and the reducer's dispatch. */
export type WizardStore = {
  state: ReportWizardState;
  dispatch: Dispatch<ReportWizardAction>;
};

export function openAppSettings() {
  Linking.openSettings().catch(() => undefined);
}
