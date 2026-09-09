import { ApiError, bindDevice, uploadHighlights } from './api.js';
import { classifyWereadPage } from './config.js';
import { fingerprintRecord } from './fingerprint.js';
import { extensionApi, getActiveReaderTab, sendMessageToTab } from './platform.js';
import {
  clearAuth,
  getAuth,
  getOrCreateDevice,
  getSyncedFingerprints,
  markFingerprintsSynced,
  saveAuth
} from './storage.js';
import { createSyncPlan, isSuccessfulBatch, splitIntoBatches } from './sync.js';

const MESSAGE_TYPE = 'RUMINOTE_PARSE_CURRENT_BOOK';
const elements = {
  appShell: document.querySelector('#appShell'),
  unsupportedPage: document.querySelector('#unsupportedPage'),
  unsupportedTitle: document.querySelector('#unsupportedTitle'),
  unsupportedMessage: document.querySelector('#unsupportedMessage'),
  bookTitle: document.querySelector('#bookTitle'),
  bookMeta: document.querySelector('#bookMeta'),
  statusPanel: document.querySelector('#statusPanel'),
  statusTitle: document.querySelector('#statusTitle'),
  statusMessage: document.querySelector('#statusMessage'),
  quoteList: document.querySelector('#quoteList'),
  quoteTemplate: document.querySelector('#quoteTemplate'),
  refreshButton: document.querySelector('#refreshButton'),
  accountButton: document.querySelector('#accountButton'),
  syncButton: document.querySelector('#syncButton'),
  syncHint: document.querySelector('#syncHint'),
  pairDialog: document.querySelector('#pairDialog'),
  pairForm: document.querySelector('#pairForm'),
  pairCode: document.querySelector('#pairCode'),
  pairError: document.querySelector('#pairError'),
  bindButton: document.querySelector('#bindButton'),
  closePairDialog: document.querySelector('#closePairDialog'),
  unbindButton: document.querySelector('#unbindButton')
};

const state = {
  result: null,
  auth: null,
  syncedFingerprints: new Set(),
  recordFingerprints: [],
  loading: false,
  syncing: false,
  syncAfterPair: false,
  authLoaded: false
};

let activeGeneration = 0;
let activationTimer = null;

function resetBookState() {
  state.result = null;
  state.syncedFingerprints = new Set();
  state.recordFingerprints = [];
  state.loading = false;
  state.syncing = false;
}

function showUnsupportedPage(pageKind) {
  resetBookState();
  elements.appShell.hidden = true;
  elements.unsupportedPage.hidden = false;
  if (elements.pairDialog.open) elements.pairDialog.close();

  if (pageKind === 'weread') {
    elements.unsupportedTitle.textContent = '请打开一本微信读书书籍';
    elements.unsupportedMessage.textContent = '当前页面是微信读书，但还没有进入书籍阅读页。';
  } else {
    elements.unsupportedTitle.textContent = '当前页面不是微信读书';
    elements.unsupportedMessage.textContent = '请先打开微信读书中的一本书，再使用 Rumi书摘。';
  }
}

function showReaderApp() {
  elements.unsupportedPage.hidden = true;
  elements.appShell.hidden = false;
  elements.bookTitle.textContent = '正在读取当前书籍…';
  elements.bookMeta.textContent = '请保持微信读书页面处于当前窗口';
}

function bookStorageKey(book) {
  return book.bookId || `weread:${book.title}\u001f${book.author}`;
}

function setStatus(kind, title, message) {
  elements.statusPanel.className = `status-panel ${kind}`;
  elements.statusTitle.textContent = title;
  elements.statusMessage.textContent = message;
  elements.statusPanel.hidden = false;
  elements.quoteList.hidden = true;
}

function updateAuthUi() {
  const connected = Boolean(state.auth?.token);
  elements.accountButton.textContent = connected ? '已绑定' : '未绑定';
  elements.accountButton.classList.toggle('connected', connected);
  elements.unbindButton.hidden = !connected;
}

function updateSyncUi(message = '') {
  const total = state.result?.records.length ?? 0;
  const syncedCount = state.recordFingerprints.filter(value => state.syncedFingerprints.has(value)).length;
  const pendingCount = Math.max(0, total - syncedCount);
  const complete = state.result?.complete === true;

  elements.syncButton.disabled = state.loading || state.syncing || !complete || total === 0 || pendingCount === 0;
  elements.syncButton.textContent = state.syncing
    ? '正在同步…'
    : pendingCount === 0 && total > 0
      ? '已全部同步'
      : `同步 ${pendingCount || total} 条书摘`;

  if (message) elements.syncHint.textContent = message;
  else if (!complete && state.result) {
    elements.syncHint.textContent = `只读取到 ${state.result.actualCount}/${state.result.expectedCount} 条，已禁止同步`;
  } else if (!state.auth?.token) {
    elements.syncHint.textContent = '首次同步前需要输入小程序配对码';
  } else {
    elements.syncHint.textContent = `${syncedCount} 条已同步 · ${pendingCount} 条待同步`;
  }
}

function renderRecords() {
  elements.quoteList.replaceChildren();

  state.result.records.forEach((record, index) => {
    const fragment = elements.quoteTemplate.content.cloneNode(true);
    const card = fragment.querySelector('.quote-card');
    fragment.querySelector('.quote-text').textContent = record.text;
    fragment.querySelector('.chapter').textContent = record.chapter || '未标注章节';

    if (record.note) {
      const note = fragment.querySelector('.note');
      note.hidden = false;
      fragment.querySelector('.note-text').textContent = record.note;
    }

    const synced = state.syncedFingerprints.has(state.recordFingerprints[index]);
    const syncState = fragment.querySelector('.sync-state');
    syncState.hidden = !synced;
    card.classList.toggle('is-synced', synced);
    elements.quoteList.append(fragment);
  });

  elements.statusPanel.hidden = true;
  elements.quoteList.hidden = false;
}

async function refreshCurrentBook(tab, generation) {
  state.loading = true;
  setStatus('loading', '正在读取书摘', '首次读取可能需要展开微信读书的笔记列表。');
  updateSyncUi();

  try {
    let response;
    try {
      response = await sendMessageToTab(tab.id, { type: MESSAGE_TYPE });
    } catch {
      throw new Error('扩展尚未连接到这个页面，请刷新微信读书页面后重试');
    }
    if (generation !== activeGeneration) return;
    if (!response?.ok) throw new Error(response?.message || '未能读取当前书籍');

    state.result = response.result;
    const book = state.result.book;
    elements.bookTitle.textContent = book.title || '当前书籍';
    elements.bookMeta.innerHTML = '';
    const author = document.createTextNode(book.author || '作者未知');
    const breakNode = document.createElement('br');
    const count = document.createElement('strong');
    count.textContent = `${state.result.actualCount} 条书摘`;
    elements.bookMeta.append(author, breakNode, count, document.createTextNode(' · 当前书籍'));

    state.recordFingerprints = await Promise.all(
      state.result.records.map(record => fingerprintRecord(book, record))
    );
    if (generation !== activeGeneration) return;
    state.syncedFingerprints = await getSyncedFingerprints(bookStorageKey(book));
    if (generation !== activeGeneration) return;

    if (state.result.records.length === 0) {
      setStatus('ready', '当前书籍还没有书摘', '在微信读书中添加书摘或想法后，再点击右上角刷新。');
      updateSyncUi('当前书籍没有可同步的书摘');
    } else {
      renderRecords();
      updateSyncUi();
    }
  } catch (error) {
    if (generation !== activeGeneration) return;
    state.result = null;
    state.recordFingerprints = [];
    setStatus('error', '无法读取书摘', error.message || '请刷新页面后重试');
    updateSyncUi(error.message);
  } finally {
    if (generation === activeGeneration) {
      state.loading = false;
      updateSyncUi(elements.syncHint.textContent);
    }
  }
}

async function activateCurrentTab() {
  const generation = ++activeGeneration;
  const tab = await getActiveReaderTab();
  if (generation !== activeGeneration) return;

  const pageKind = classifyWereadPage(tab?.url ?? '');
  if (!tab?.id || pageKind !== 'reader') {
    showUnsupportedPage(pageKind);
    return;
  }

  showReaderApp();
  if (!state.authLoaded) {
    state.auth = await getAuth();
    if (generation !== activeGeneration) return;
    state.authLoaded = true;
    updateAuthUi();
  }
  await refreshCurrentBook(tab, generation);
}

function scheduleActiveTabRefresh() {
  clearTimeout(activationTimer);
  activationTimer = setTimeout(activateCurrentTab, 80);
}

function openPairDialog(continueSync = false) {
  state.syncAfterPair = continueSync;
  elements.pairError.textContent = '';
  elements.pairCode.value = '';
  if (!elements.pairDialog.open) elements.pairDialog.showModal();
  if (!state.auth?.token) elements.pairCode.focus();
}

async function handlePairSubmit(event) {
  event.preventDefault();
  const pairCode = elements.pairCode.value.trim();
  if (!/^\d{6}$/.test(pairCode)) {
    elements.pairError.textContent = '请输入六位数字配对码';
    return;
  }

  elements.bindButton.disabled = true;
  elements.bindButton.textContent = '正在绑定…';
  elements.pairError.textContent = '';
  try {
    const device = await getOrCreateDevice();
    const auth = await bindDevice(pairCode, device);
    state.auth = auth;
    await saveAuth(auth);
    updateAuthUi();
    updateSyncUi('绑定成功，可以同步当前书籍');
    const shouldContinueSync = state.syncAfterPair;
    state.syncAfterPair = false;
    elements.pairDialog.close();
    if (shouldContinueSync) await handleSync();
  } catch (error) {
    elements.pairError.textContent = error.message || '绑定失败，请重新生成配对码';
  } finally {
    elements.bindButton.disabled = false;
    elements.bindButton.textContent = '绑定此浏览器';
  }
}

async function handleUnbind() {
  await clearAuth();
  state.auth = null;
  updateAuthUi();
  updateSyncUi('已清除本地绑定，可重新输入配对码');
  elements.pairDialog.close();
}

async function handleSync() {
  if (!state.result?.complete || state.syncing) return;
  if (!state.auth?.token) {
    openPairDialog(true);
    return;
  }

  state.syncing = true;
  updateSyncUi('正在准备未同步书摘…');

  try {
    const book = state.result.book;
    const plan = await createSyncPlan({
      book,
      records: state.result.records,
      syncedFingerprints: state.syncedFingerprints,
      fingerprint: fingerprintRecord
    });

    if (plan.length === 0) {
      updateSyncUi('当前书籍已全部同步');
      return;
    }

    let accepted = 0;
    let duplicated = 0;
    for (const batch of splitIntoBatches(plan)) {
      const response = await uploadHighlights(state.auth.token, batch.map(entry => entry.item));
      if (!isSuccessfulBatch(response, batch.length)) {
        throw new ApiError('服务器未确认整批书摘，已保留待下次重传', {
          code: 'PARTIAL_BATCH',
          payload: response
        });
      }

      accepted += Number(response.accepted ?? 0);
      duplicated += Number(response.duplicated ?? 0);
      const fingerprints = batch.map(entry => entry.fingerprint);
      await markFingerprintsSynced(bookStorageKey(book), fingerprints);
      fingerprints.forEach(value => state.syncedFingerprints.add(value));
    }

    renderRecords();
    updateSyncUi(`同步完成：新增 ${accepted} 条，已存在 ${duplicated} 条`);
  } catch (error) {
    const code = String(error.code ?? '').toLowerCase();
    if (error.status === 401 || code === 'unauthorized') {
      await clearAuth();
      state.auth = null;
      updateAuthUi();
      updateSyncUi('绑定已失效，请重新输入配对码');
      openPairDialog(true);
    } else if (code === 'quota_exceeded') {
      updateSyncUi('今日额度已用完，本批未标记，下次可继续同步');
    } else {
      updateSyncUi(error.message || '同步失败，本批已保留');
    }
  } finally {
    state.syncing = false;
    updateSyncUi(elements.syncHint.textContent);
  }
}

elements.refreshButton.addEventListener('click', activateCurrentTab);
elements.accountButton.addEventListener('click', () => openPairDialog(false));
elements.syncButton.addEventListener('click', handleSync);
elements.pairForm.addEventListener('submit', handlePairSubmit);
elements.closePairDialog.addEventListener('click', () => elements.pairDialog.close());
elements.pairDialog.addEventListener('close', () => {
  state.syncAfterPair = false;
});
elements.unbindButton.addEventListener('click', handleUnbind);
elements.pairCode.addEventListener('input', () => {
  elements.pairCode.value = elements.pairCode.value.replace(/\D/g, '').slice(0, 6);
  elements.pairError.textContent = '';
});

extensionApi.tabs.onActivated.addListener(scheduleActiveTabRefresh);
extensionApi.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (tab.active && (changeInfo.url || changeInfo.status === 'complete')) {
    scheduleActiveTabRefresh();
  }
});

await activateCurrentTab();
