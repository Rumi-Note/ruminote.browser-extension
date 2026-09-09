const SELECTORS = Object.freeze({
  title: '.wr_reader_note_panel_header_cell_info_title',
  metadata: 'script[type="application/ld+json"]',
  countInfo: '.wr_reader_note_panel_header_cell_info_info',
  footerButton: '.wr_reader_note_panel_footer_button',
  chapter: '.wr_reader_note_panel_chapter_wrapper',
  chapterTitle: '.wr_reader_note_panel_chapter_title',
  item: '.wr_reader_note_panel_item_cell_wrapper',
  text: '.wr_reader_note_panel_item_cell_content_text',
  reference: '.wr_reader_note_panel_item_cell_content_ref'
});

export function normalizeText(value) {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/[\t ]+/g, ' ')
    .trim();
}

function parseJsonLd(document) {
  const raw = document.querySelector(SELECTORS.metadata)?.textContent ?? '';
  if (!raw.trim()) return {};

  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function readExpectedCount(document) {
  const candidates = [
    ...document.querySelectorAll(SELECTORS.countInfo),
    ...document.querySelectorAll(SELECTORS.footerButton)
  ];

  for (const candidate of candidates) {
    const match = normalizeText(candidate.textContent).match(/(?:共|·)\s*(\d+)\s*条笔记|复制全部笔记\s*·\s*(\d+)/);
    if (match) return Number(match[1] ?? match[2]);
  }

  return null;
}

function createBook(metadata, titleFallback, authorFallback = '') {
  const sourceBookId = normalizeText(metadata['@Id']);
  const title = normalizeText(metadata.name) || normalizeText(titleFallback);
  const author = normalizeText(metadata.author?.name) || normalizeText(authorFallback);

  return {
    source: 'weread',
    sourceBookId: sourceBookId || null,
    bookId: sourceBookId ? `weread_${sourceBookId}` : null,
    title,
    author
  };
}

function createRecord({ chapter, text, note = '', type, publishedDate = null, publishedDateRaw = null }) {
  return {
    source: 'weread',
    chapter: normalizeText(chapter),
    text: normalizeText(text),
    note: normalizeText(note),
    sourceType: type,
    publishedDate,
    publishedDateRaw
  };
}

export function parseWereadNotesFromDocument(document) {
  if (!document?.querySelector || !document?.querySelectorAll) {
    throw new TypeError('A DOM Document is required');
  }

  const metadata = parseJsonLd(document);
  const book = createBook(metadata, document.querySelector(SELECTORS.title)?.textContent);
  const records = [];

  for (const chapterElement of document.querySelectorAll(SELECTORS.chapter)) {
    const chapter = normalizeText(chapterElement.querySelector(SELECTORS.chapterTitle)?.textContent);

    for (const itemElement of chapterElement.querySelectorAll(SELECTORS.item)) {
      const displayedText = normalizeText(itemElement.querySelector(SELECTORS.text)?.textContent);
      const referenceText = normalizeText(itemElement.querySelector(SELECTORS.reference)?.textContent);

      if (referenceText) {
        records.push(createRecord({
          chapter,
          text: referenceText,
          note: displayedText,
          type: 'thought'
        }));
      } else if (displayedText) {
        records.push(createRecord({
          chapter,
          text: displayedText,
          type: 'highlight'
        }));
      }
    }
  }

  const expectedCount = readExpectedCount(document);
  return {
    book,
    expectedCount,
    actualCount: records.length,
    complete: expectedCount !== null && expectedCount === records.length,
    records
  };
}

function nextNonEmpty(lines, start) {
  let index = start;
  while (index < lines.length && !lines[index].trim()) index += 1;
  return index;
}

export function parseWereadCopiedNotes(input) {
  const lines = String(input ?? '').replace(/\r\n?/g, '\n').split('\n');
  let index = nextNonEmpty(lines, 0);
  const titleMatch = lines[index]?.trim().match(/^《(.+)》$/);
  const title = normalizeText(titleMatch?.[1]);
  index = nextNonEmpty(lines, index + 1);
  const author = normalizeText(lines[index]);
  index = nextNonEmpty(lines, index + 1);
  const countMatch = lines[index]?.trim().match(/^(\d+)\s*个笔记$/);
  const expectedCount = countMatch ? Number(countMatch[1]) : null;
  index += 1;

  const records = [];
  let chapter = '';

  while (index < lines.length) {
    index = nextNonEmpty(lines, index);
    if (index >= lines.length) break;

    const line = lines[index].trim();
    if (line === '-- 来自微信读书') break;

    const thoughtMatch = line.match(/^◆\s*(\d{4})\/(\d{1,2})\/(\d{1,2})发表想法$/);
    if (thoughtMatch) {
      const rawDate = `${thoughtMatch[1]}/${thoughtMatch[2].padStart(2, '0')}/${thoughtMatch[3].padStart(2, '0')}`;
      const publishedDate = rawDate.replaceAll('/', '-');
      index = nextNonEmpty(lines, index + 1);

      const noteLines = [];
      while (index < lines.length) {
        const candidate = lines[index].trim();
        if (candidate.startsWith('原文：')) break;
        if (candidate) noteLines.push(candidate);
        index += 1;
      }

      const reference = lines[index]?.trim().replace(/^原文：/, '') ?? '';
      records.push(createRecord({
        chapter,
        text: reference,
        note: noteLines.join('\n'),
        type: 'thought',
        publishedDate,
        publishedDateRaw: rawDate
      }));
      index += 1;
      continue;
    }

    if (line.startsWith('◆ ')) {
      records.push(createRecord({
        chapter,
        text: line.slice(2),
        type: 'highlight'
      }));
      index += 1;
      continue;
    }

    chapter = normalizeText(line);
    index += 1;
  }

  return {
    book: createBook({}, title, author),
    expectedCount,
    actualCount: records.length,
    complete: expectedCount === null || expectedCount === records.length,
    records
  };
}

function recordKey(record) {
  return [
    normalizeText(record.chapter),
    record.sourceType,
    normalizeText(record.text),
    normalizeText(record.note)
  ].join('\u001f');
}

export function parseWereadCurrentBook(document, copiedNotesText = '') {
  const parsedDocument = parseWereadNotesFromDocument(document);
  if (!copiedNotesText.trim()) return parsedDocument;

  const parsedText = parseWereadCopiedNotes(copiedNotesText);
  const copiedByKey = new Map(parsedText.records.map(record => [recordKey(record), record]));
  const records = parsedDocument.records.map(record => {
    const copied = copiedByKey.get(recordKey(record));
    return copied
      ? { ...record, publishedDate: copied.publishedDate, publishedDateRaw: copied.publishedDateRaw }
      : record;
  });

  return {
    ...parsedDocument,
    book: {
      ...parsedDocument.book,
      author: parsedDocument.book.author || parsedText.book.author
    },
    records
  };
}
