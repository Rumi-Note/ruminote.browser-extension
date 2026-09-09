import assert from 'node:assert/strict';
import test from 'node:test';

import { createIdentitySeed } from '../src/fingerprint.js';
import {
  createSyncPlan,
  createUploadItem,
  isSuccessfulBatch,
  splitIntoBatches
} from '../src/sync.js';

const book = {
  sourceBookId: '26631437',
  title: '资治通鉴·横排版（胡三省注）294卷全',
  author: '司馬光 胡三省 鄒寰宇'
};
const highlight = {
  chapter: '資治通鑑卷第十六',
  text: '河間王太傅衞綰擊吳、楚有功，拜爲中尉',
  note: '',
  sourceType: 'highlight',
  publishedDate: null
};
const thought = {
  ...highlight,
  note: '测试想法，这是一条笔记内容的点评',
  sourceType: 'thought',
  publishedDate: '2026-09-08'
};

test('identity distinguishes a thought from a standalone highlight with identical text', () => {
  assert.notEqual(createIdentitySeed(book, highlight), createIdentitySeed(book, thought));
});

test('identity does not change when a thought comment is edited', () => {
  assert.equal(
    createIdentitySeed(book, thought),
    createIdentitySeed(book, { ...thought, note: '修改后的想法' })
  );
});

test('creates a stable backend upload item without exposing style differences', () => {
  const item = createUploadItem(book, thought, 'abc123', 100);
  assert.deepEqual(item, {
    book: { title: book.title, author: book.author },
    text: thought.text,
    note: thought.note,
    chapter: thought.chapter,
    pos0: 'weread:abc123',
    pos1: 'weread:abc123',
    color: null,
    source: 'weread',
    koreader_ts: 1788796800
  });
});

test('plans only records absent from the local synced set', async () => {
  const fingerprint = async (_book, record) => record.sourceType;
  const plan = await createSyncPlan({
    book,
    records: [highlight, thought],
    syncedFingerprints: new Set(['highlight']),
    fingerprint
  });

  assert.equal(plan.length, 1);
  assert.equal(plan[0].fingerprint, 'thought');
  assert.equal(plan[0].item.note, thought.note);
});

test('splits large uploads into bounded batches', () => {
  assert.deepEqual(splitIntoBatches([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});

test('marks a batch successful only when every item is accepted or duplicated', () => {
  assert.equal(isSuccessfulBatch({ ok: true, accepted: 2, duplicated: 1 }, 3), true);
  assert.equal(isSuccessfulBatch({ ok: true, accepted: 1, duplicated: 1 }, 3), false);
  assert.equal(isSuccessfulBatch({ ok: false, accepted: 3, duplicated: 0 }, 3), false);
});

test('does not accept a quota-exceeded response as a successful batch', () => {
  assert.equal(isSuccessfulBatch({ ok: false, code: 'QUOTA_EXCEEDED' }, 1), false);
});
