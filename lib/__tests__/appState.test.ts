const mockStore = new Map<string, string>();
const mockFailingKeys = new Set<string>();

jest.mock('../deviceStore', () => ({
  getDeviceItem: jest.fn(async (key: string) => {
    if (mockFailingKeys.has(key)) throw new Error('keychain unavailable');
    return mockStore.get(key) ?? null;
  }),
  setDeviceItem: jest.fn(async (key: string, value: string) => {
    mockStore.set(key, value);
  }),
}));

import { loadAppSettings } from '../appState';
import { EMPTY_PROFILE } from '../profile';

describe('loadAppSettings', () => {
  beforeEach(() => {
    mockStore.clear();
    mockFailingKeys.clear();
  });

  it('reads every setting in one go', async () => {
    mockStore.set('civic-snap-profile', JSON.stringify({ name: 'Ada', email: '', phone: '555' }));
    mockStore.set('civic-snap-photo-analysis-enabled', 'false');
    mockStore.set('civic-snap-email-polish-enabled', 'true');
    mockStore.set('civic-snap-onboarding-complete', 'true');

    await expect(loadAppSettings()).resolves.toEqual({
      emailPolishEnabled: true,
      onboardingComplete: true,
      photoAnalysis: 'off',
      profile: { name: 'Ada', email: '', phone: '555' },
    });
  });

  it('starts a fresh install with photo suggestions unasked and onboarding to do', async () => {
    await expect(loadAppSettings()).resolves.toEqual({
      emailPolishEnabled: false,
      onboardingComplete: false,
      photoAnalysis: 'unset',
      profile: EMPTY_PROFILE,
    });
  });

  it('falls back to the safe choice for a setting it cannot read', async () => {
    mockStore.set('civic-snap-onboarding-complete', 'true');
    mockFailingKeys.add('civic-snap-photo-analysis-enabled');
    mockFailingKeys.add('civic-snap-email-polish-enabled');

    const settings = await loadAppSettings();
    expect(settings.photoAnalysis).toBe('off');
    expect(settings.emailPolishEnabled).toBe(false);
    expect(settings.onboardingComplete).toBe(true);
  });
});
