import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { defaultPackageLogLevels, LOG_LEVELS_STORAGE_KEY } from './logSettings.ts';
import { loadSettings, saveLogLevels, saveSetting, transcriptionContextFromSettings } from './settings.ts';

function installMemoryStorage() {
  const map = new Map<string, string>();
  const storage = {
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    },
    removeItem(key: string) {
      map.delete(key);
    },
    clear() {
      map.clear();
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    get length() {
      return map.size;
    },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage,
  });
  return map;
}

describe('settings log level persistence', () => {
  let map: Map<string, string>;

  beforeEach(() => {
    map = installMemoryStorage();
  });

  it('loads info defaults when nothing is stored', () => {
    assert.deepEqual(loadSettings().logLevels, defaultPackageLogLevels());
  });

  it('persists per-package levels in the storage-cap / developer-mode family', () => {
    const next = { ...defaultPackageLogLevels(), 'capture-engine': 'debug' as const, 'web-whisper-pwa': 'off' as const };
    saveLogLevels(next);
    assert.equal(typeof map.get(LOG_LEVELS_STORAGE_KEY), 'string');
    assert.deepEqual(loadSettings().logLevels, next);
  });
});

describe('context-aware transcription settings', () => {
  beforeEach(() => {
    installMemoryStorage();
  });

  it('defaults context on and vocabulary empty', () => {
    const loaded = loadSettings();
    assert.equal(loaded.contextAwareTranscription, true);
    assert.equal(loaded.transcriptionVocabulary, '');
    assert.deepEqual(transcriptionContextFromSettings(loaded), {
      contextEnabled: true,
      vocabulary: '',
    });
  });

  it('persists the toggle off and a vocabulary line', () => {
    saveSetting('contextAwareTranscription', false);
    saveSetting('transcriptionVocabulary', 'Asana, Groq, BrainGraft, TeleLinux');
    const loaded = loadSettings();
    assert.equal(loaded.contextAwareTranscription, false);
    assert.equal(loaded.transcriptionVocabulary, 'Asana, Groq, BrainGraft, TeleLinux');
    assert.deepEqual(transcriptionContextFromSettings(loaded), {
      contextEnabled: false,
      vocabulary: 'Asana, Groq, BrainGraft, TeleLinux',
    });
  });
});
