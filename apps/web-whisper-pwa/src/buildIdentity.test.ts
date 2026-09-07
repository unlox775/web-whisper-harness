import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildIdentityLines, formatBuiltAt, resolveBuildIdentity } from './buildIdentity.ts';

describe('resolveBuildIdentity', () => {
  it('uses injected version, short SHA, and ISO time', () => {
    const identity = resolveBuildIdentity({
      VITE_APP_VERSION: '0.1.0',
      VITE_GIT_SHA: '50f4697',
      VITE_GIT_SHA_FULL: '50f46972e08c0c30a45e265e7ead98154e4315ad',
      VITE_BUILD_TIME: '2026-09-07T06:05:00.000Z',
    });
    assert.deepEqual(identity, {
      version: '0.1.0',
      gitSha: '50f4697',
      gitShaFull: '50f46972e08c0c30a45e265e7ead98154e4315ad',
      buildTimeIso: '2026-09-07T06:05:00.000Z',
    });
  });

  it('falls back to unknown instead of inventing a SHA', () => {
    const identity = resolveBuildIdentity({});
    assert.equal(identity.version, 'unknown');
    assert.equal(identity.gitSha, 'unknown');
    assert.equal(identity.gitShaFull, 'unknown');
    assert.equal(identity.buildTimeIso, 'unknown');
  });

  it('treats blank git SHA as unknown', () => {
    const identity = resolveBuildIdentity({
      VITE_APP_VERSION: '0.1.0',
      VITE_GIT_SHA: '   ',
      VITE_BUILD_TIME: '2026-09-07T06:05:00.000Z',
    });
    assert.equal(identity.gitSha, 'unknown');
  });
});

describe('buildIdentityLines', () => {
  it('renders Version / Build / Built lines', () => {
    const lines = buildIdentityLines({
      version: '0.1.0',
      gitSha: '50f4697',
      gitShaFull: '50f46972e08c0c30a45e265e7ead98154e4315ad',
      buildTimeIso: '2026-09-07T06:05:00.000Z',
    });
    assert.equal(lines[0], 'Version 0.1.0');
    assert.equal(lines[1], 'Build 50f4697');
    assert.match(lines[2] ?? '', /^Built /);
  });

  it('shows Build unknown when git is missing', () => {
    const lines = buildIdentityLines({
      version: '0.1.0',
      gitSha: 'unknown',
      gitShaFull: 'unknown',
      buildTimeIso: 'unknown',
    });
    assert.deepEqual(lines, ['Version 0.1.0', 'Build unknown']);
  });
});

describe('formatBuiltAt', () => {
  it('hides the Built line when the timestamp is unknown or invalid', () => {
    assert.equal(formatBuiltAt('unknown'), null);
    assert.equal(formatBuiltAt(''), null);
    assert.equal(formatBuiltAt('not-a-date'), null);
  });
});
