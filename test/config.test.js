import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyWereadPage } from '../src/config.js';

test('classifies a WeRead book reader page', () => {
  assert.equal(classifyWereadPage('https://weread.qq.com/web/reader/abc123'), 'reader');
});

test('classifies WeRead pages outside the reader', () => {
  assert.equal(classifyWereadPage('https://weread.qq.com/web/shelf'), 'weread');
  assert.equal(classifyWereadPage('https://weread.qq.com/'), 'weread');
});

test('rejects non-WeRead domains and deceptive hostnames', () => {
  assert.equal(classifyWereadPage('https://example.com/web/reader/abc123'), 'other');
  assert.equal(classifyWereadPage('https://weread.qq.com.example.com/web/reader/abc123'), 'other');
  assert.equal(classifyWereadPage('not-a-url'), 'other');
});
