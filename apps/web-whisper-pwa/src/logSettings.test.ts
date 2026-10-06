import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  LOG_LEVELS,
  LOG_PACKAGE_IDS,
  applyLoggerConfig,
  defaultPackageLogLevels,
  formatLogBytesLine,
  formatLogPackageSize,
  isLogLevel,
  parsePackageLogLevels,
  serializePackageLogLevels,
  withPackageLogLevel,
} from './logSettings.ts';

describe('package log levels', () => {
  it('defaults every frozen package id to info', () => {
    assert.deepEqual(LOG_PACKAGE_IDS, [
      'session-store',
      'capture-engine',
      'volume-analyzer',
      'transcription-client',
      'playback-engine',
      'web-whisper-pwa',
    ]);
    const defaults = defaultPackageLogLevels();
    for (const packageId of LOG_PACKAGE_IDS) {
      assert.equal(defaults[packageId], 'info');
    }
  });

  it('accepts the five Settings levels including off', () => {
    assert.deepEqual(LOG_LEVELS, ['debug', 'info', 'warn', 'error', 'off']);
    assert.equal(isLogLevel('debug'), true);
    assert.equal(isLogLevel('off'), true);
    assert.equal(isLogLevel('trace'), false);
  });

  it('round-trips localStorage JSON and ignores unknown keys / bad levels', () => {
    const stored = parsePackageLogLevels(
      serializePackageLogLevels(
        withPackageLogLevel(defaultPackageLogLevels(), 'capture-engine', 'debug')
      )
    );
    assert.equal(stored['capture-engine'], 'debug');
    assert.equal(stored['web-whisper-pwa'], 'info');

    const recovered = parsePackageLogLevels(
      JSON.stringify({
        'capture-engine': 'warn',
        'not-a-package': 'debug',
        'session-store': 'nope',
        'web-whisper-pwa': 'off',
      })
    );
    assert.equal(recovered['capture-engine'], 'warn');
    assert.equal(recovered['session-store'], 'info');
    assert.equal(recovered['web-whisper-pwa'], 'off');
    assert.equal('not-a-package' in recovered, false);
  });

  it('falls back to defaults for missing or invalid JSON', () => {
    assert.deepEqual(parsePackageLogLevels(null), defaultPackageLogLevels());
    assert.deepEqual(parsePackageLogLevels(''), defaultPackageLogLevels());
    assert.deepEqual(parsePackageLogLevels('{'), defaultPackageLogLevels());
    assert.deepEqual(parsePackageLogLevels('[]'), defaultPackageLogLevels());
  });

  it('sends levels + activeSessionId to configureLogger', () => {
    const calls: Array<{ levels?: Record<string, string>; activeSessionId?: string | null }> = [];
    const levels = withPackageLogLevel(defaultPackageLogLevels(), 'playback-engine', 'error');
    applyLoggerConfig((options) => calls.push(options), {
      levels,
      activeSessionId: 'ses_take',
    });
    applyLoggerConfig((options) => calls.push(options), {
      levels,
      activeSessionId: null,
    });
    assert.deepEqual(calls, [
      { levels, activeSessionId: 'ses_take' },
      { levels, activeSessionId: null },
    ]);
  });
});

describe('log byte size copy', () => {
  it('formats the Settings total like other storage chips', () => {
    assert.equal(formatLogBytesLine(0), '0 B logs');
    assert.equal(formatLogBytesLine(1200), '1.2 KB logs');
    assert.equal(formatLogBytesLine(1.2 * 1024 * 1024), '1.2 MB logs');
  });

  it('formats the optional per-package breakdown', () => {
    assert.equal(
      formatLogPackageSize('capture-engine', { bytes: 4096, count: 3 }),
      'capture-engine · 4.0 KB'
    );
  });
});
