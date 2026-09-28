import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeClipboardVerified } from '../src/core/clipboard';

test('clipboard detects silent OS refusal, retries contention and reports success only after readback', async () => {
  let writes = 0;
  await assert.rejects(writeClipboardVerified(async () => { writes++; }, async () => false), /剪贴板暂不可用/);
  assert.equal(writes, 3);
  writes = 0; let saved = '';
  await writeClipboardVerified(async () => { if (++writes === 1) throw new Error('clipboard busy'); saved = '中文🌊'; }, async () => saved === '中文🌊');
  assert.equal(writes, 2); assert.equal(saved, '中文🌊');
  await assert.rejects(writeClipboardVerified(async () => {}, async () => { throw new Error('access denied'); }), /剪贴板暂不可用/);
});
