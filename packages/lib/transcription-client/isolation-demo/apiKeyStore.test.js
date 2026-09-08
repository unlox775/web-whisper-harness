import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEMO_API_KEY_STORAGE,
  PWA_API_KEY_STORAGE,
  applyPastedKey,
  describeKeySource,
  loadStoredApiKey,
  persistDemoApiKey,
} from './apiKeyStore.js';

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = String(value);
    },
    removeItem(key) {
      delete data[key];
    },
    data,
  };
}

describe('loadStoredApiKey', () => {
  it('prefers the demo namespace over the PWA key', () => {
    const storage = memoryStorage({
      [DEMO_API_KEY_STORAGE]: '  gsk_demo  ',
      [PWA_API_KEY_STORAGE]: 'gsk_pwa',
    });
    assert.deepEqual(loadStoredApiKey(storage), { key: 'gsk_demo', source: 'demo' });
  });

  it('falls back to groq_api_key when the demo key is missing', () => {
    const storage = memoryStorage({ [PWA_API_KEY_STORAGE]: 'gsk_from_pwa' });
    assert.deepEqual(loadStoredApiKey(storage), { key: 'gsk_from_pwa', source: 'pwa' });
  });

  it('does not break when storage is missing or empty', () => {
    assert.deepEqual(loadStoredApiKey(undefined), { key: '', source: null });
    assert.deepEqual(loadStoredApiKey(memoryStorage()), { key: '', source: null });
    const throwing = {
      getItem() {
        throw new Error('blocked');
      },
    };
    assert.deepEqual(loadStoredApiKey(throwing), { key: '', source: null });
  });
});

describe('persistDemoApiKey', () => {
  it('writes only the demo namespace and never groq_api_key', () => {
    const storage = memoryStorage({ [PWA_API_KEY_STORAGE]: 'gsk_keep' });
    persistDemoApiKey('  gsk_typed  ', storage);
    assert.equal(storage.data[DEMO_API_KEY_STORAGE], 'gsk_typed');
    assert.equal(storage.data[PWA_API_KEY_STORAGE], 'gsk_keep');
  });

  it('clears the demo key when the field is emptied', () => {
    const storage = memoryStorage({ [DEMO_API_KEY_STORAGE]: 'gsk_old' });
    persistDemoApiKey('   ', storage);
    assert.equal(storage.data[DEMO_API_KEY_STORAGE], undefined);
  });
});

describe('applyPastedKey', () => {
  it('replaces the current selection with clipboard text', () => {
    assert.equal(applyPastedKey('abcXXX', 3, 6, 'gsk_new'), 'abcgsk_new');
    assert.equal(applyPastedKey('', null, null, 'gsk_paste'), 'gsk_paste');
  });
});

describe('describeKeySource', () => {
  it('names the keys that were checked', () => {
    assert.match(describeKeySource('demo'), /ww-iso-transcription-client:groqApiKey/);
    assert.match(describeKeySource('pwa'), /groq_api_key/);
    assert.equal(describeKeySource(null), '');
  });
});
