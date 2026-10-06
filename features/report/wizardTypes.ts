import type { Dispatch } from 'react';
import { Linking } from 'react-native';

import type { ReportWizardAction, ReportWizardState } from './reportWizardState';

/** What every wizard hook gets: the current state and the reducer's dispatch. */
export type WizardStore = {
  state: ReportWizardState;
  dispatch: Dispatch<ReportWizardAction>;
};

export function openAppSettings() {
  Linking.openSettings().catch(() => undefined);
}
