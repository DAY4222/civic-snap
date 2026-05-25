import { getDeviceItem, setDeviceItem } from './deviceStore';

const INSTALL_ID_KEY = 'civic-snap-install-id';

export async function getInstallId() {
  const existing = await getDeviceItem(INSTALL_ID_KEY);
  if (existing) return existing;

  const installId = `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random()
    .toString(16)
    .slice(2)}`;
  await setDeviceItem(INSTALL_ID_KEY, installId);
  return installId;
}
