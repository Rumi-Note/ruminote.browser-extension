import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  normalizeText,
  parseWereadCopiedNotes,
  parseWereadCurrentBook,
  parseWereadNotesFromDocument
} from '../src/parser.js';

const fixtureUrl = new URL('./fixtures/weread-12.json', import.meta.url);
const copiedNotesUrl = new URL('./fixtures/weread-12.txt', import.meta.url);
const fixture = JSON.parse(await readFile(fixtureUrl, 'utf8'));
const copiedNotes = await readFile(copiedNotesUrl, 'utf8');

class FixtureElement {
  constructor({ tag = 'div', classes = [], text = '', attributes = {}, children = [] } = {}) {
    this.tag = tag;
    this.classList = new Set(classes);
    this.textContent = text;
    this.attributes = attributes;
    this.children = children;
  }

  matches(selector) {
    if (selector.startsWith('.')) return this.classList.has(selector.slice(1));
    if (selector === 'script[type="application/ld+json"]') {
      return this.tag === 'script' && this.attributes.type === 'application/ld+json';
    }
    return false;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector) {
    const matches = [];
    for (const child of this.children) {
      if (child.matches(selector)) matches.push(child);
      matches.push(...child.querySelectorAll(selector));
    }
    return matches;
  }
}

function element(options) {
  return new FixtureElement(options);
}

function createFixtureDocument(overrides = {}) {
  const source = {
    ...fixture,
    ...overrides,
    book: { ...fixture.book, ...overrides.book }
  };

  const chapters = source.chapters.map(chapter => element({
    classes: ['wr_reader_note_panel_chapter_wrapper'],
    children: [
      element({ classes: ['wr_reader_note_panel_chapter_title'], text: chapter.title }),
      ...chapter.items.map(item => element({
        classes: ['wr_reader_note_panel_item_cell_wrapper'],
        children: [
          element({
            classes: ['wr_reader_note_panel_item_cell_content'],
            children: [
              element({ classes: ['wr_reader_note_panel_item_cell_content_text'], text: `${item.text}\n` }),
              ...(item.reference
                ? [element({ classes: ['wr_reader_note_panel_item_cell_content_ref'], text: item.reference })]
                : [])
            ]
          })
        ]
      }))
    ]
  }));

  return element({
    tag: 'document',
    children: [
      element({ classes: ['wr_reader_note_panel_header_cell_info_title'], text: source.book.title }),
      element({
        tag: 'script',
        attributes: { type: 'application/ld+json' },
        text: JSON.stringify({
          '@Id': source.book.sourceBookId,
          '@type': 'Book',
          name: source.book.title,
          author: { '@type': 'Person', name: source.book.author }
        })
      }),
      element({ classes: ['wr_reader_note_panel_header_cell_info_info'], text: `已读到3% · 共${source.expectedCount}条笔记` }),
      element({ classes: ['wr_reader_note_panel_footer_button'], text: `复制全部笔记 · ${source.expectedCount}` }),
      ...chapters
    ]
  });
}

test('normalizes page whitespace without changing Chinese characters or punctuation', () => {
  assert.equal(normalizeText('  河間王\n  太傅衞綰  '), '河間王 太傅衞綰');
});

test('parses book metadata and all 12 DOM records', () => {
  const result = parseWereadNotesFromDocument(createFixtureDocument());

  assert.deepEqual(result.book, {
    source: 'weread',
    sourceBookId: '26631437',
    bookId: 'weread_26631437',
    title: '资治通鉴·横排版（胡三省注）294卷全',
    author: '司馬光 胡三省 鄒寰宇'
  });
  assert.equal(result.expectedCount, 12);
  assert.equal(result.actualCount, 12);
  assert.equal(result.complete, true);
});

test('keeps chapter order and expected record counts', () => {
  const result = parseWereadNotesFromDocument(createFixtureDocument());
  const counts = result.records.reduce((grouped, record) => {
    grouped[record.chapter] = (grouped[record.chapter] ?? 0) + 1;
    return grouped;
  }, {});

  assert.deepEqual(counts, {
      資治通鑑卷第一: 1,
      資治通鑑卷第二: 3,
      資治通鑑卷第三: 1,
      資治通鑑卷第十: 5,
      資治通鑑卷第十六: 2
    }
  );
});

test('maps a thought to quoted text plus its comment', () => {
  const result = parseWereadNotesFromDocument(createFixtureDocument());
  const thought = result.records.find(record => record.text === '破楚必矣');

  assert.deepEqual(thought, {
    source: 'weread',
    chapter: '資治通鑑卷第十',
    text: '破楚必矣',
    note: '确实是',
    sourceType: 'thought',
    publishedDate: null,
    publishedDateRaw: null
  });
});

test('preserves the thought and standalone highlight when their quoted text is identical', () => {
  const result = parseWereadNotesFromDocument(createFixtureDocument());
  const duplicateTextRecords = result.records.filter(
    record => record.text === '河間王太傅衞綰擊吳、楚有功，拜爲中尉'
  );

  assert.equal(duplicateTextRecords.length, 2);
  assert.deepEqual(duplicateTextRecords.map(record => record.sourceType), ['thought', 'highlight']);
  assert.equal(duplicateTextRecords[0].note, '测试想法，这是一条笔记内容的点评');
  assert.equal(duplicateTextRecords[1].note, '');
});

test('parses all 12 copied records and both thought dates', () => {
  const result = parseWereadCopiedNotes(copiedNotes);
  const thoughts = result.records.filter(record => record.sourceType === 'thought');

  assert.equal(result.actualCount, 12);
  assert.equal(result.complete, true);
  assert.equal(thoughts.length, 2);
  assert.deepEqual(thoughts.map(record => record.publishedDate), ['2026-09-08', '2026-09-08']);
  assert.deepEqual(thoughts.map(record => record.publishedDateRaw), ['2026/09/08', '2026/09/08']);
});

test('enriches DOM thoughts with dates from copied notes', () => {
  const result = parseWereadCurrentBook(createFixtureDocument(), copiedNotes);
  const thoughts = result.records.filter(record => record.sourceType === 'thought');

  assert.deepEqual(thoughts.map(record => record.publishedDate), ['2026-09-08', '2026-09-08']);
});

test('marks an incomplete DOM extraction as unsafe to sync', () => {
  const result = parseWereadNotesFromDocument(createFixtureDocument({ expectedCount: 13 }));

  assert.equal(result.actualCount, 12);
  assert.equal(result.expectedCount, 13);
  assert.equal(result.complete, false);
});

test('treats a missing declared count as unsafe to sync', () => {
  const document = createFixtureDocument();
  document.children = document.children.filter(child =>
    !child.classList.has('wr_reader_note_panel_header_cell_info_info') &&
    !child.classList.has('wr_reader_note_panel_footer_button')
  );

  const result = parseWereadNotesFromDocument(document);
  assert.equal(result.expectedCount, null);
  assert.equal(result.actualCount, 12);
  assert.equal(result.complete, false);
});
