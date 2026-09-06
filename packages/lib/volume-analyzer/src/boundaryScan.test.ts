import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CONTIGUOUS_REPEAT_HEADLINE,
  NGRAM_SKIPPED_NO_TRANSCRIPTS,
  findAdjacentNgramHits,
  formatBoundaryScanIssues,
  formatSnipClock,
  normalizeToken,
  rangesAbut,
  rangesOverlap,
  scanSnipBoundaries,
  tokenizeTranscript,
} from './boundaryScan.js';

describe('time overlap vs abut', () => {
  it('flags an overlapping pair ([0, 10] vs [8, 15])', () => {
    assert.equal(rangesOverlap(0, 10, 8, 15), true);
    const result = scanSnipBoundaries([
      { id: 'a', startTime: 0, endTime: 10 },
      { id: 'b', startTime: 8, endTime: 15 },
    ]);
    assert.equal(result.overlapCount, 1);
    assert.equal(result.overlaps[0].overlapFrom, 8);
    assert.equal(result.overlaps[0].overlapTo, 10);
    assert.equal(result.overlaps[0].overlapDuration, 2);
    assert.equal(result.boundaries[0].abutting, false);
  });

  it('treats abutting [115, 131] / [131, 150] as no overlap, yes contiguous', () => {
    assert.equal(rangesOverlap(115, 131, 131, 150), false);
    assert.equal(rangesAbut(115, 131, 131, 150), true);
    const result = scanSnipBoundaries([
      { id: '9', startTime: 115, endTime: 131 },
      { id: '10', startTime: 131, endTime: 150 },
    ]);
    assert.equal(result.overlapCount, 0);
    assert.equal(result.boundaries.length, 1);
    assert.equal(result.boundaries[0].abutting, true);
    assert.equal(result.boundaries[0].overlapDuration, 0);
    assert.equal(result.boundaries[0].contiguousBoundaryRepeat, false);
  });

  it('does not treat a 1ms-or-less touch as overlap', () => {
    const result = scanSnipBoundaries([
      { startTime: 0, endTime: 10.0005 },
      { startTime: 10, endTime: 20 },
    ]);
    assert.equal(result.overlapCount, 0);
    assert.equal(result.boundaries[0].abutting, true);
  });

  it('returns empty findings for empty / invalid lists', () => {
    assert.equal(scanSnipBoundaries([]).snipCount, 0);
    assert.equal(scanSnipBoundaries(null).overlapCount, 0);
    assert.equal(scanSnipBoundaries(undefined).boundaries.length, 0);
    const invalid = scanSnipBoundaries([
      { id: 'bad', startTime: 10, endTime: 10 },
      { id: 'worse', startTime: 12, endTime: 8 },
    ]);
    assert.equal(invalid.snipCount, 2);
    assert.equal(invalid.overlapCount, 0);
    assert.equal(invalid.boundaries.length, 0);
  });
});

describe('adjacent n-gram (BLT / quesadilla)', () => {
  it('normalizes BLT\'s. possessives and wrapping punctuation', () => {
    assert.equal(normalizeToken("BLT's."), 'blt');
    assert.equal(normalizeToken('BLT'), 'blt');
    assert.deepEqual(tokenizeTranscript("ends with BLT's."), ['ends', 'with', 'blt']);
  });

  it('flags k=1 for “BLT\'s.” / “BLT is cheese quesadilla”', () => {
    const hits = findAdjacentNgramHits("BLT's.", 'BLT is cheese quesadilla');
    assert.ok(hits.some((hit) => hit.k === 1 && hit.tokens[0] === 'blt'));
    const result = scanSnipBoundaries(
      [
        { id: '9', startTime: 115, endTime: 131 },
        { id: '10', startTime: 131, endTime: 150 },
      ],
      ["…and a BLT's.", 'BLT is cheese quesadilla']
    );
    assert.equal(result.overlapCount, 0);
    assert.equal(result.ngramHitCount, 1);
    assert.equal(result.contiguousRepeatCount, 1);
    assert.equal(result.contiguousRepeats[0].contiguousBoundaryRepeat, true);
    assert.equal(result.contiguousRepeats[0].ngramHits[0].k, 1);
    assert.deepEqual(result.contiguousRepeats[0].ngramHits[0].tokens, ['blt']);
  });

  it('flags k=2 for “…cheese quesadilla” / “cheese quesadillas…” (trailing-s stem)', () => {
    const hits = findAdjacentNgramHits(
      'I want a cheese quesadilla',
      'cheese quesadillas are next'
    );
    const k2 = hits.find((hit) => hit.k === 2);
    assert.ok(k2, 'expected k=2 hit after stemming trailing s');
    assert.deepEqual(k2?.tokens, ['cheese', 'quesadilla']);
    const result = scanSnipBoundaries([
      { id: '10', startTime: 131, endTime: 150, text: 'BLT is cheese quesadilla' },
      { id: '11', startTime: 150, endTime: 170, text: 'cheese quesadillas on the side' },
    ]);
    assert.equal(result.contiguousRepeats[0].contiguousBoundaryRepeat, true);
    assert.equal(result.contiguousRepeats[0].ngramHits[0].k, 2);
  });

  it('joins { snipId, text } transcripts onto matching snip ids', () => {
    const result = scanSnipBoundaries(
      [
        { id: '9', startTime: 115, endTime: 131 },
        { id: '10', startTime: 131, endTime: 150 },
      ],
      [
        { snipId: '10', text: 'BLT is cheese quesadilla' },
        { snipId: '9', text: "BLT's." },
      ]
    );
    assert.equal(result.contiguousRepeatCount, 1);
  });
});

describe('missing transcripts and contiguous + n-gram', () => {
  it('skips n-gram when no transcripts, still reports overlaps', () => {
    const result = scanSnipBoundaries([
      { startTime: 0, endTime: 10 },
      { startTime: 8, endTime: 15 },
    ]);
    assert.equal(result.overlapCount, 1);
    assert.equal(result.ngramSkipped, true);
    assert.equal(result.ngramSkipNote, NGRAM_SKIPPED_NO_TRANSCRIPTS);
    assert.equal(result.ngramHitCount, 0);
    assert.equal(result.contiguousRepeatCount, 0);
    assert.equal(result.boundaries[0].ngramSkipped, true);
    assert.equal(result.boundaries[0].ngramSkipReason, 'no_transcripts');
  });

  it('skips only the boundary that is missing text', () => {
    const result = scanSnipBoundaries([
      { id: 'a', startTime: 0, endTime: 10, text: 'hello world' },
      { id: 'b', startTime: 10, endTime: 20 },
      { id: 'c', startTime: 20, endTime: 30, text: 'world peace' },
    ]);
    assert.equal(result.ngramSkipped, false);
    assert.equal(result.boundaries[0].ngramSkipped, true);
    assert.equal(result.boundaries[0].ngramSkipReason, 'missing_text');
    assert.equal(result.boundaries[1].ngramSkipped, true);
  });

  it('sets contiguousBoundaryRepeat when abutting + n-gram even if overlap is 0', () => {
    const result = scanSnipBoundaries([
      { id: '9', startTime: 115, endTime: 131, text: "order a BLT's." },
      { id: '10', startTime: 131, endTime: 150, text: 'BLT is cheese quesadilla' },
    ]);
    assert.equal(result.overlapCount, 0);
    assert.equal(result.contiguousRepeats[0].contiguousBoundaryRepeat, true);
    const issues = formatBoundaryScanIssues(result);
    assert.ok(issues.some((issue) => issue.startsWith(CONTIGUOUS_REPEAT_HEADLINE)));
    assert.ok(issues.some((issue) => issue.includes('blt')));
    assert.equal(formatSnipClock(115), '1:55');
    assert.equal(formatSnipClock(131), '2:11');
  });
});
