function utf8Bytes(value) {
  return new TextEncoder().encode(value);
}

function toHex(buffer) {
  return [...new Uint8Array(buffer)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function createIdentitySeed(book, record) {
  return [
    'weread',
    book.sourceBookId || `${book.title}\u001f${book.author}`,
    record.chapter,
    record.sourceType,
    record.text
  ].join('\u001e');
}

export async function fingerprintRecord(book, record) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', utf8Bytes(createIdentitySeed(book, record)));
  return toHex(digest);
}
