export const extensionApi = globalThis.browser ?? globalThis.chrome;

export async function getActiveReaderTab() {
  const [tab] = await extensionApi.tabs.query({ active: true, currentWindow: true });
  return tab ?? null;
}

export async function sendMessageToTab(tabId, message) {
  return extensionApi.tabs.sendMessage(tabId, message);
}

export async function storageGet(keys) {
  return extensionApi.storage.local.get(keys);
}

export async function storageSet(values) {
  return extensionApi.storage.local.set(values);
}
