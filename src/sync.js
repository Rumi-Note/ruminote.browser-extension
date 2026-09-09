import { MAX_BATCH_SIZE } from './config.js';

export function createUploadItem(book, record, fingerprint, nowSeconds = Math.floor(Date.now() / 1000)) {
  const publishedTimestamp = record.publishedDate
    ? Math.floor(Date.parse(`${record.publishedDate}T00:00:00+08:00`) / 1000)
    : nowSeconds;

  return {
    book: { title: book.title, author: book.author },
    text: record.text,
    note: record.note || '',
    chapter: record.chapter || '',
    pos0: `weread:${fingerprint}`,
    pos1: `weread:${fingerprint}`,
    color: null,
    source: 'weread',
    koreader_ts: publishedTimestamp
  };
}

export async function createSyncPlan({ book, records, syncedFingerprints, fingerprint }) {
  const entries = await Promise.all(records.map(async record => {
    const value = await fingerprint(book, record);
    return { fingerprint: value, record };
  }));

  return entries
    .filter(entry => !syncedFingerprints.has(entry.fingerprint))
    .map(entry => ({
      ...entry,
      item: createUploadItem(book, entry.record, entry.fingerprint)
    }));
}

export function splitIntoBatches(entries, size = MAX_BATCH_SIZE) {
  const batches = [];
  for (let index = 0; index < entries.length; index += size) {
    batches.push(entries.slice(index, index + size));
  }
  return batches;
}

export function isSuccessfulBatch(response, submittedCount) {
  if (!response?.ok) return false;
  return Number(response.accepted ?? 0) + Number(response.duplicated ?? 0) === submittedCount;
}
