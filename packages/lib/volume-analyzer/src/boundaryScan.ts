/**
 * Diagnosis-only scan of snip time ranges and adjacent transcript n-grams.
 * Does not change proposeSnipsFromProfile / snip algorithm.
 *
 * Tokenization (documented rule):
 * - lowercase, split on whitespace
 * - strip wrapping punctuation (`BLT's.` → `blt's`)
 * - strip possessive `'s` or a trailing `'` (`blt's` → `blt`)
 * - comparison stems one trailing `s` (not `ss`) on tokens longer than 3 chars
 *   so `quesadilla` ≈ `quesadillas` (k=2 for Dave’s #10/#11)
 *
 * Time:
 * - overlap when intersection length > OVERLAP_EPSILON_SECONDS (1 ms)
 * - abutting (`|endA − startB| ≤ ε`) is NOT an overlap
 * - `contiguousBoundaryRepeat` when abutting (overlap 0) AND an n-gram hits
 */

export const OVERLAP_EPSILON_SECONDS = 0.001;
export const NGRAM_SKIPPED_NO_TRANSCRIPTS = 'n-gram skipped — no transcripts';
export const CONTIGUOUS_REPEAT_HEADLINE =
  'Contiguous times with repeated words — not a time overlap.';

export type BoundaryScanSnipInput = {
  startTime: number;
  endTime: number;
  id?: string | number;
  snipId?: string | number;
  text?: string | null;
};

export type BoundaryScanTranscriptInput =
  | string
  | { snipId?: string | number; id?: string | number; text?: string | null }
  | null
  | undefined;

export type TimeOverlapFinding = {
  leftIndex: number;
  rightIndex: number;
  leftId?: string;
  rightId?: string;
  leftLabel: string;
  rightLabel: string;
  leftRange: [number, number];
  rightRange: [number, number];
  overlapFrom: number;
  overlapTo: number;
  overlapDuration: number;
};

export type NgramHit = {
  k: number;
  tokens: string[];
  leftTokens: string[];
  rightTokens: string[];
};

export type AdjacentBoundaryFinding = {
  leftIndex: number;
  rightIndex: number;
  leftId?: string;
  rightId?: string;
  leftLabel: string;
  rightLabel: string;
  leftRange: [number, number];
  rightRange: [number, number];
  abutting: boolean;
  overlapDuration: number;
  ngramSkipped: boolean;
  ngramSkipReason?: 'no_transcripts' | 'missing_text';
  ngramHits: NgramHit[];
  contiguousBoundaryRepeat: boolean;
};

export type BoundaryScanResult = {
  snipCount: number;
  overlapCount: number;
  ngramHitCount: number;
  contiguousRepeatCount: number;
  ngramSkipped: boolean;
  ngramSkipNote?: string;
  overlaps: TimeOverlapFinding[];
  boundaries: AdjacentBoundaryFinding[];
  contiguousRepeats: AdjacentBoundaryFinding[];
};

export type FlaggedBoundaryTime = {
  time: number;
  kind: 'overlap' | 'contiguous';
};

type IndexedSnip = {
  index: number;
  startTime: number;
  endTime: number;
  id?: string;
  label: string;
  text?: string;
  valid: boolean;
};

function asId(value: string | number | undefined | null): string | undefined {
  if (value == null) return undefined;
  const s = String(value);
  return s.length > 0 ? s : undefined;
}

function snipIdentity(snip: BoundaryScanSnipInput): string | undefined {
  return asId(snip.id) ?? asId(snip.snipId);
}

function snipLabel(snip: BoundaryScanSnipInput, fallbackIndex: number): string {
  return snipIdentity(snip) ?? String(fallbackIndex + 1);
}

/**
 * Clock like Dave’s Debug UI: `1:55`, `2:11`. Sub-minute stays `12.3s`.
 */
export function formatSnipClock(seconds: number): string {
  if (!Number.isFinite(seconds)) return '?';
  const sign = seconds < 0 ? '-' : '';
  const abs = Math.abs(seconds);
  const mins = Math.floor(abs / 60);
  const secs = abs - mins * 60;
  if (mins <= 0) return `${sign}${secs.toFixed(1)}s`;
  const whole = Math.floor(secs + 1e-9);
  const frac = secs - whole;
  const fracLabel = frac >= 0.05 ? `.${Math.round(frac * 10)}` : '';
  return `${sign}${mins}:${String(whole).padStart(2, '0')}${fracLabel}`;
}

export function formatSnipRange(startTime: number, endTime: number): string {
  return `${formatSnipClock(startTime)}→${formatSnipClock(endTime)}`;
}

/**
 * Lowercase, strip wrapping punctuation, drop possessive `'s` / trailing `'`.
 */
export function normalizeToken(raw: string): string {
  let token = raw.toLowerCase().trim();
  token = token.replace(/^[^a-z0-9]+/i, '').replace(/[^a-z0-9]+$/i, '');
  if (token.endsWith("'s") || token.endsWith('’s')) {
    token = token.slice(0, -2);
  } else if (token.endsWith("'") || token.endsWith('’')) {
    token = token.slice(0, -1);
  }
  return token;
}

/** Stem one trailing plural `s` (not `ss`) for comparison only. */
export function stemTokenForCompare(token: string): string {
  if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) {
    return token.slice(0, -1);
  }
  return token;
}

export function tokensApproxEqual(a: string, b: string): boolean {
  return stemTokenForCompare(a) === stemTokenForCompare(b);
}

export function tokenizeTranscript(text: string): string[] {
  return text
    .split(/\s+/)
    .map(normalizeToken)
    .filter((token) => token.length > 0);
}

export function findAdjacentNgramHits(leftText: string, rightText: string): NgramHit[] {
  const leftTokens = tokenizeTranscript(leftText);
  const rightTokens = tokenizeTranscript(rightText);
  const hits: NgramHit[] = [];
  for (let k = 3; k >= 1; k--) {
    if (leftTokens.length < k || rightTokens.length < k) continue;
    const left = leftTokens.slice(-k);
    const right = rightTokens.slice(0, k);
    if (left.every((token, i) => tokensApproxEqual(token, right[i]))) {
      hits.push({ k, tokens: left, leftTokens: left, rightTokens: right });
    }
  }
  return hits;
}

function rangeIntersection(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number
): { from: number; to: number; duration: number } {
  const from = Math.max(aStart, bStart);
  const to = Math.min(aEnd, bEnd);
  return { from, to, duration: to - from };
}

export function rangesOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
  epsilon = OVERLAP_EPSILON_SECONDS
): boolean {
  const { duration } = rangeIntersection(aStart, aEnd, bStart, bEnd);
  return duration > epsilon;
}

export function rangesAbut(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
  epsilon = OVERLAP_EPSILON_SECONDS
): boolean {
  return Math.abs(aEnd - bStart) <= epsilon || Math.abs(bEnd - aStart) <= epsilon;
}

function resolveTexts(
  snips: BoundaryScanSnipInput[],
  transcripts?: BoundaryScanTranscriptInput[] | null
): { texts: Array<string | undefined>; anyText: boolean } {
  const texts: Array<string | undefined> = snips.map((snip) =>
    typeof snip.text === 'string' && snip.text.trim().length > 0 ? snip.text : undefined
  );

  if (Array.isArray(transcripts) && transcripts.length > 0) {
    const byId = new Map<string, string>();
    transcripts.forEach((entry, index) => {
      if (entry == null) return;
      if (typeof entry === 'string') {
        if (entry.trim().length > 0 && index < texts.length) {
          texts[index] = entry;
        }
        return;
      }
      const id = asId(entry.snipId) ?? asId(entry.id);
      if (typeof entry.text === 'string' && entry.text.trim().length > 0) {
        if (id) byId.set(id, entry.text);
        if (index < texts.length && !id) texts[index] = entry.text;
      }
    });
    snips.forEach((snip, index) => {
      const id = snipIdentity(snip);
      if (id && byId.has(id)) {
        texts[index] = byId.get(id);
      }
    });
  }

  const anyText = texts.some((text) => typeof text === 'string' && text.trim().length > 0);
  return { texts, anyText };
}

function emptyResult(snipCount = 0, ngramSkipped = false): BoundaryScanResult {
  return {
    snipCount,
    overlapCount: 0,
    ngramHitCount: 0,
    contiguousRepeatCount: 0,
    ngramSkipped,
    ngramSkipNote: ngramSkipped ? NGRAM_SKIPPED_NO_TRANSCRIPTS : undefined,
    overlaps: [],
    boundaries: [],
    contiguousRepeats: [],
  };
}

/**
 * Scan a snip list for time overlaps and adjacent 1–3 token transcript repeats.
 * Transcripts may be parallel strings, `{ snipId, text }` rows, or `snip.text`.
 */
export function scanSnipBoundaries(
  snips: BoundaryScanSnipInput[] | null | undefined,
  transcripts?: BoundaryScanTranscriptInput[] | null
): BoundaryScanResult {
  if (!Array.isArray(snips) || snips.length === 0) {
    return emptyResult(0, false);
  }

  const { texts, anyText } = resolveTexts(snips, transcripts);
  const indexed: IndexedSnip[] = snips.map((snip, index) => ({
    index,
    startTime: Number(snip.startTime),
    endTime: Number(snip.endTime),
    id: snipIdentity(snip),
    label: snipLabel(snip, index),
    text: texts[index],
    valid:
      Number.isFinite(Number(snip.startTime)) &&
      Number.isFinite(Number(snip.endTime)) &&
      Number(snip.endTime) > Number(snip.startTime),
  }));

  const valid = indexed.filter((snip) => snip.valid);
  const sorted = [...valid].sort((a, b) => {
    if (a.startTime !== b.startTime) return a.startTime - b.startTime;
    if (a.endTime !== b.endTime) return a.endTime - b.endTime;
    return a.index - b.index;
  });

  const overlaps: TimeOverlapFinding[] = [];
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const left = sorted[i];
      const right = sorted[j];
      const hit = rangeIntersection(left.startTime, left.endTime, right.startTime, right.endTime);
      if (hit.duration > OVERLAP_EPSILON_SECONDS) {
        overlaps.push({
          leftIndex: left.index,
          rightIndex: right.index,
          leftId: left.id,
          rightId: right.id,
          leftLabel: left.label,
          rightLabel: right.label,
          leftRange: [left.startTime, left.endTime],
          rightRange: [right.startTime, right.endTime],
          overlapFrom: hit.from,
          overlapTo: hit.to,
          overlapDuration: hit.duration,
        });
      }
    }
  }

  const ngramSkippedGlobally = !anyText;
  const boundaries: AdjacentBoundaryFinding[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const left = sorted[i];
    const right = sorted[i + 1];
    const hit = rangeIntersection(left.startTime, left.endTime, right.startTime, right.endTime);
    const overlapDuration = hit.duration > OVERLAP_EPSILON_SECONDS ? hit.duration : 0;
    const abutting = rangesAbut(left.startTime, left.endTime, right.startTime, right.endTime);

    let ngramHits: NgramHit[] = [];
    let ngramSkipped = false;
    let ngramSkipReason: AdjacentBoundaryFinding['ngramSkipReason'];
    if (ngramSkippedGlobally) {
      ngramSkipped = true;
      ngramSkipReason = 'no_transcripts';
    } else if (!left.text || !right.text) {
      ngramSkipped = true;
      ngramSkipReason = 'missing_text';
    } else {
      ngramHits = findAdjacentNgramHits(left.text, right.text);
    }

    const contiguousBoundaryRepeat = abutting && ngramHits.length > 0;
    boundaries.push({
      leftIndex: left.index,
      rightIndex: right.index,
      leftId: left.id,
      rightId: right.id,
      leftLabel: left.label,
      rightLabel: right.label,
      leftRange: [left.startTime, left.endTime],
      rightRange: [right.startTime, right.endTime],
      abutting,
      overlapDuration,
      ngramSkipped,
      ngramSkipReason,
      ngramHits,
      contiguousBoundaryRepeat,
    });
  }

  const ngramHitCount = boundaries.filter((b) => b.ngramHits.length > 0).length;
  const contiguousRepeats = boundaries.filter((b) => b.contiguousBoundaryRepeat);

  return {
    snipCount: snips.length,
    overlapCount: overlaps.length,
    ngramHitCount,
    contiguousRepeatCount: contiguousRepeats.length,
    ngramSkipped: ngramSkippedGlobally,
    ngramSkipNote: ngramSkippedGlobally ? NGRAM_SKIPPED_NO_TRANSCRIPTS : undefined,
    overlaps,
    boundaries,
    contiguousRepeats,
  };
}

export function flaggedBoundaryTimes(result: BoundaryScanResult): FlaggedBoundaryTime[] {
  const times: FlaggedBoundaryTime[] = [];
  for (const overlap of result.overlaps) {
    times.push({ time: overlap.overlapFrom, kind: 'overlap' });
    if (Math.abs(overlap.overlapTo - overlap.overlapFrom) > OVERLAP_EPSILON_SECONDS) {
      times.push({ time: overlap.overlapTo, kind: 'overlap' });
    }
  }
  for (const boundary of result.contiguousRepeats) {
    times.push({ time: boundary.leftRange[1], kind: 'contiguous' });
  }
  return times;
}

export function formatBoundaryScanIssues(
  result: BoundaryScanResult,
  label = 'Snip'
): string[] {
  const issues: string[] = [];
  for (const overlap of result.overlaps) {
    issues.push(
      `${label} ${overlap.leftLabel} overlaps ${label} ${overlap.rightLabel}: ` +
        `${formatSnipRange(overlap.leftRange[0], overlap.leftRange[1])} ∩ ` +
        `${formatSnipRange(overlap.rightRange[0], overlap.rightRange[1])} = ` +
        `${formatSnipRange(overlap.overlapFrom, overlap.overlapTo)} ` +
        `(${overlap.overlapDuration.toFixed(3)}s)`
    );
  }
  for (const boundary of result.boundaries) {
    if (boundary.contiguousBoundaryRepeat) {
      const tokens = boundary.ngramHits[0]?.tokens.join(' ') ?? '';
      issues.push(
        `${CONTIGUOUS_REPEAT_HEADLINE} ${label} ${boundary.leftLabel} ` +
          `(${formatSnipRange(boundary.leftRange[0], boundary.leftRange[1])}) / ` +
          `${label} ${boundary.rightLabel} ` +
          `(${formatSnipRange(boundary.rightRange[0], boundary.rightRange[1])}) ` +
          `repeat “${tokens}”`
      );
      continue;
    }
    if (boundary.ngramHits.length > 0) {
      const tokens = boundary.ngramHits[0]?.tokens.join(' ') ?? '';
      issues.push(
        `Adjacent n-gram repeat: ${label} ${boundary.leftLabel} / ${label} ${boundary.rightLabel} ` +
          `repeat “${tokens}” (k=${boundary.ngramHits[0]?.k ?? 0})`
      );
    }
  }
  return issues;
}
