const mockStore = new Map<string, string>();

jest.mock('../deviceStore', () => ({
  getDeviceItem: jest.fn(async (key: string) => mockStore.get(key) ?? null),
  setDeviceItem: jest.fn(async (key: string, value: string) => {
    mockStore.set(key, value);
  }),
}));

import { EMPTY_PROFILE, loadProfile, saveProfile } from '../profile';

describe('profile storage', () => {
  beforeEach(() => {
    mockStore.clear();
  });

  it('normalizes malformed stored profile fields to strings', async () => {
    mockStore.set(
      'civic-snap-profile',
      JSON.stringify({
        email: 42,
        name: 'Ada',
        phone: null,
      })
    );

    await expect(loadProfile()).resolves.toEqual({
      email: '',
      name: 'Ada',
      phone: '',
    });
  });

  it('falls back to an empty profile when stored JSON is invalid', async () => {
    mockStore.set('civic-snap-profile', 'not json');

    await expect(loadProfile()).resolves.toEqual(EMPTY_PROFILE);
  });

  it('persists profile values through the device store adapter', async () => {
    await saveProfile({
      email: 'ada@example.com',
      name: 'Ada',
      phone: '555-0100',
    });

    await expect(loadProfile()).resolves.toEqual({
      email: 'ada@example.com',
      name: 'Ada',
      phone: '555-0100',
    });
  });
});
