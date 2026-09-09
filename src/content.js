import { parseWereadNotesFromDocument } from './parser.js';

const api = globalThis.browser ?? globalThis.chrome;
const MESSAGE_TYPE = 'RUMINOTE_PARSE_CURRENT_BOOK';
const ITEM_SELECTOR = '.wr_reader_note_panel_item_cell_wrapper';
const LIST_SELECTOR = '.readerNoteList';
const SCROLLER_SELECTOR = '.readerNotePanel_scroll_container';
const TOGGLE_SELECTOR = 'button.readerControls_item.wr_note';

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function waitForElement(selector, timeout = 5000) {
  const existing = document.querySelector(selector);
  if (existing) return existing;

  return new Promise(resolve => {
    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector);
      if (!element) return;
      observer.disconnect();
      resolve(element);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => {
      observer.disconnect();
      resolve(document.querySelector(selector));
    }, timeout);
  });
}

async function loadAllNotes() {
  let openedPanel = false;
  let list = document.querySelector(LIST_SELECTOR);

  if (!list || list.querySelectorAll(ITEM_SELECTOR).length === 0) {
    const toggle = document.querySelector(TOGGLE_SELECTOR);
    if (!toggle) throw new Error('找不到微信读书的“笔记”按钮，请刷新页面后重试');
    toggle.click();
    openedPanel = true;
    list = await waitForElement(LIST_SELECTOR);
  }

  if (!list) throw new Error('微信读书笔记列表尚未加载');

  let result = parseWereadNotesFromDocument(document);
  if (!result.complete && !openedPanel) {
    const toggle = document.querySelector(TOGGLE_SELECTOR);
    if (toggle) {
      toggle.click();
      openedPanel = true;
      await delay(300);
      result = parseWereadNotesFromDocument(document);
    }
  }

  const scroller = document.querySelector(SCROLLER_SELECTOR);
  const originalScrollTop = scroller?.scrollTop ?? 0;
  let stableRounds = 0;
  let previousCount = result.actualCount;

  while (!result.complete && scroller && stableRounds < 4) {
    scroller.scrollTop = scroller.scrollHeight;
    await delay(300);
    result = parseWereadNotesFromDocument(document);

    if (result.actualCount === previousCount) stableRounds += 1;
    else stableRounds = 0;
    previousCount = result.actualCount;
  }

  if (scroller) scroller.scrollTop = originalScrollTop;
  if (openedPanel) document.querySelector(TOGGLE_SELECTOR)?.click();
  return result;
}

async function parseCurrentBook() {
  if (!location.href.startsWith('https://weread.qq.com/web/reader/')) {
    throw new Error('请先打开一本微信读书网页版书籍');
  }
  return loadAllNotes();
}

api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== MESSAGE_TYPE) return undefined;

  parseCurrentBook()
    .then(result => sendResponse({ ok: true, result }))
    .catch(error => sendResponse({ ok: false, message: error.message || '解析失败' }));
  return true;
});
