import { PLATFORM } from './config.js';
import { storageGet, storageSet } from './platform.js';

const KEYS = Object.freeze({
  device: 'ruminote.device',
  auth: 'ruminote.auth',
  synced: 'ruminote.synced'
});

function makeRandomId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

export async function getOrCreateDevice() {
  const stored = await storageGet(KEYS.device);
  if (stored[KEYS.device]?.deviceId) return stored[KEYS.device];

  const device = {
    deviceId: `${PLATFORM}_${makeRandomId()}`,
    deviceName: `Ruminote 微信读书 · ${navigator.userAgent.includes('Firefox') ? 'Firefox' : 'Chrome'}`,
    platform: PLATFORM
  };
  await storageSet({ [KEYS.device]: device });
  return device;
}

export async function getAuth() {
  const stored = await storageGet(KEYS.auth);
  return stored[KEYS.auth] ?? null;
}

export async function saveAuth(auth) {
  await storageSet({ [KEYS.auth]: auth });
}

export async function clearAuth() {
  await storageSet({ [KEYS.auth]: null });
}

export async function getSyncedFingerprints(bookKey) {
  const stored = await storageGet(KEYS.synced);
  const all = stored[KEYS.synced] ?? {};
  return new Set(all[bookKey] ?? []);
}

export async function markFingerprintsSynced(bookKey, fingerprints) {
  const stored = await storageGet(KEYS.synced);
  const all = stored[KEYS.synced] ?? {};
  const merged = new Set([...(all[bookKey] ?? []), ...fingerprints]);
  all[bookKey] = [...merged];
  await storageSet({ [KEYS.synced]: all });
}
