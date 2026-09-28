import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PREVIEW, normalizePreviewSettings } from '../src/shared/preview-settings';

test('preview preferences recover invalid storage and preserve custom dimensions without a false device label', () => {
  assert.deepEqual(normalizePreviewSettings(null), DEFAULT_PREVIEW);
  assert.deepEqual(normalizePreviewSettings({ width: NaN, height: Infinity }), DEFAULT_PREVIEW);
  assert.deepEqual(normalizePreviewSettings({ preset: 'unknown', width: -10, height: 99999 }), { preset: 'custom', width: 240, height: 1600 });
  assert.deepEqual(normalizePreviewSettings({ preset: 'iphone-se', width: 375, height: 667 }), { preset: 'iphone-se', width: 375, height: 667 });
  assert.deepEqual(normalizePreviewSettings({ preset: 'iphone-se', width: 400.2, height: 700.8 }), { preset: 'custom', width: 400, height: 701 });
});
