/**
 * Session-row chunk coverage. Kept in sync on writeChunk / import / finalize
 * so getChunkCoverage is a session get, not a blob-store walk.
 */

export function emptyCoverageFields() {
  return {
    lastSeq: -1,
    savedCount: 0,
    missingSeqs: [],
    savedDurationMs: 0,
    lostChunks: []
  };
}

export function hasPersistedCoverage(session) {
  return Boolean(
    session &&
      typeof session.lastSeq === 'number' &&
      Number.isFinite(session.lastSeq) &&
      typeof session.savedCount === 'number' &&
      Number.isFinite(session.savedCount) &&
      Array.isArray(session.missingSeqs) &&
      typeof session.savedDurationMs === 'number' &&
      Number.isFinite(session.savedDurationMs)
  );
}

export function chunkDurationMs(chunk) {
  if (typeof chunk?.duration === 'number' && Number.isFinite(chunk.duration)) {
    return chunk.duration * 1000;
  }
  const start = typeof chunk?.startTime === 'number' ? chunk.startTime : 0;
  const end = typeof chunk?.endTime === 'number' ? chunk.endTime : start;
  return Math.max(0, (end - start) * 1000);
}

export function publicChunkMeta(chunk) {
  return {
    id: chunk.id,
    sessionId: chunk.sessionId,
    seq: chunk.seq,
    startTime: chunk.startTime,
    endTime: chunk.endTime,
    duration: chunk.duration,
    sizeBytes: chunk.sizeBytes,
    audioPurgedAt: chunk.audioPurgedAt || null
  };
}

export function stripBlob(record) {
  if (!record || typeof record !== 'object') return record;
  if (!Object.prototype.hasOwnProperty.call(record, 'blob')) return record;
  const copy = { ...record };
  delete copy.blob;
  return copy;
}

/**
 * Fold a newly saved chunk into session coverage. Idempotent for a seq that
 * is already counted. Mutates `session`. Returns true when coverage changed.
 *
 * @param {object} session
 * @param {object} chunk
 * @returns {boolean}
 */
export function applySavedChunkToCoverage(session, chunk) {
  const seq = chunk?.seq;
  if (typeof seq !== 'number' || !Number.isFinite(seq)) return false;

  const lastSeq = typeof session.lastSeq === 'number' ? session.lastSeq : -1;
  const missing = Array.isArray(session.missingSeqs) ? session.missingSeqs.slice() : [];
  const alreadySaved = lastSeq >= 0 && seq <= lastSeq && !missing.includes(seq);
  if (alreadySaved) return false;

  let newLast = lastSeq;
  let newMissing = missing;
  if (seq > lastSeq) {
    for (let s = lastSeq + 1; s < seq; s += 1) {
      newMissing.push(s);
    }
    newLast = seq;
  } else {
    newMissing = missing.filter((value) => value !== seq);
  }

  session.lastSeq = newLast;
  session.savedCount = (typeof session.savedCount === 'number' ? session.savedCount : 0) + 1;
  session.missingSeqs = newMissing;
  session.savedDurationMs =
    (typeof session.savedDurationMs === 'number' ? session.savedDurationMs : 0) +
    chunkDurationMs(chunk);
  return true;
}

export function coverageFromSession(session) {
  return {
    expectedFirstSeq: 0,
    lastSeq: typeof session.lastSeq === 'number' ? session.lastSeq : -1,
    savedCount: typeof session.savedCount === 'number' ? session.savedCount : 0,
    missingSeqs: Array.isArray(session.missingSeqs) ? session.missingSeqs.slice() : [],
    savedDurationMs: typeof session.savedDurationMs === 'number' ? session.savedDurationMs : 0,
    lostChunks: Array.isArray(session.lostChunks) ? session.lostChunks.slice() : []
  };
}

export function computeCoverageFromChunkMetas(chunks, lostChunks = []) {
  const seqs = (chunks || [])
    .map((chunk) => chunk.seq)
    .filter((seq) => typeof seq === 'number' && Number.isFinite(seq))
    .sort((a, b) => a - b);
  const expectedFirstSeq = 0;
  const lastSeq = seqs.length > 0 ? seqs[seqs.length - 1] : -1;
  const saved = new Set(seqs);
  const missingSeqs = [];
  if (lastSeq >= expectedFirstSeq) {
    for (let seq = expectedFirstSeq; seq <= lastSeq; seq += 1) {
      if (!saved.has(seq)) missingSeqs.push(seq);
    }
  }
  const savedDurationMs = (chunks || []).reduce((sum, chunk) => sum + chunkDurationMs(chunk), 0);
  return {
    expectedFirstSeq,
    lastSeq,
    savedCount: (chunks || []).length,
    missingSeqs,
    savedDurationMs,
    lostChunks: Array.isArray(lostChunks) ? lostChunks.slice() : []
  };
}

export function assignCoverageToSession(session, coverage) {
  session.lastSeq = coverage.lastSeq;
  session.savedCount = coverage.savedCount;
  session.missingSeqs = coverage.missingSeqs.slice();
  session.savedDurationMs = coverage.savedDurationMs;
  if (Array.isArray(coverage.lostChunks)) {
    session.lostChunks = coverage.lostChunks.slice();
  }
}
