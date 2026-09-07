/**
 * Isolation Demo live tick — calls the same incremental helpers session.ts uses.
 * Do not reimplement freeze / windowStartTime here or in App.tsx.
 */

import {
  analyzeVolumeIncremental,
  detectSilenceGaps,
  proposeSnipsIncremental,
  SAMPLE_WINDOW_MS,
  type ChunkMetadata,
  type ChunkVolumeProfile,
  type ChunkWithBlob,
  type IncrementalProposeResult,
  type Snip,
  type SnipOptions,
} from './volumeAnalyzer';

export type DemoEventName =
  | 'chunkEncoded'
  | 'volumeUpdated'
  | 'snipsProposed'
  | 'snipFrozen'
  | 'trailingCommitted'
  | 'replayComplete';

export type DemoEvent = {
  at: number;
  name: DemoEventName;
  detail: Record<string, unknown>;
};

export type FloorHistoryRow = {
  snipId: number;
  closedAt: number;
  windowStart: number;
  windowSamples: number;
  floorDb: number | null;
  includeTrailing: boolean;
};

export type TickTelemetry = {
  analyzeMs: number;
  proposeMs: number;
  floorDb: number | null;
  windowStartTime: number;
  windowSampleCount: number;
  profileReused: boolean;
  newChunksDecoded: number;
  analyzeFn: string;
  proposeFn: string;
  volumeFn: string;
  gapCount: number;
  error?: string;
};

export type LiveTickInput = {
  chunk: ChunkMetadata;
  blob: Blob | null;
  storedProfile?: ChunkVolumeProfile | null;
  existingProfiles: ChunkVolumeProfile[];
  existingChunks: ChunkWithBlob[];
  frozenSnips: Snip[];
  includeTrailing: boolean;
  options?: SnipOptions;
};

export type LiveTickResult = {
  profiles: ChunkVolumeProfile[];
  chunks: ChunkWithBlob[];
  propose: IncrementalProposeResult;
  events: DemoEvent[];
  telemetry: TickTelemetry;
  reason: string;
  newFloorRows: FloorHistoryRow[];
};

function placeholderBlob(): Blob {
  return new Blob([], { type: 'application/octet-stream' });
}

export function formatFloorDb(db: number | null): string {
  if (db == null || !Number.isFinite(db)) return '—';
  return `${db.toFixed(1)} dB`;
}

export function reasonForTick(
  seq: number,
  propose: IncrementalProposeResult,
  profileReused: boolean,
  stopped: boolean
): string {
  const floor = formatFloorDb(propose.adaptiveFloorDb);
  const window = propose.windowStartTime.toFixed(1);
  if (stopped && propose.includeTrailing) {
    const committed = propose.committedThisTick[propose.committedThisTick.length - 1];
    if (committed) {
      return `Stop: includeTrailing true — committed trailing ${committed.startTime.toFixed(1)}–${committed.endTime.toFixed(1)}s as snip #${committed.snipId}.`;
    }
    return `Stop: includeTrailing true — no trailing region left to commit.`;
  }
  if (propose.newlyClosed.length > 0) {
    const closed = propose.newlyClosed[0];
    return `Tick seq ${seq}: windowStart ${window}s, floor ${floor}, closed snip #${closed.snipId} ${closed.startTime.toFixed(1)}–${closed.endTime.toFixed(1)}s (target reached + quiet center). New windowStart ${closed.endTime.toFixed(1)}s.`;
  }
  if (propose.trailing) {
    return `Tick seq ${seq}: windowStart ${window}s, floor ${floor}, no quiet-gap cut yet — trailing ${propose.trailing.startTime.toFixed(1)}–${propose.trailing.endTime.toFixed(1)}s held.`;
  }
  const reused = profileReused
    ? ' Archive replay used stored samples; floor history is from incremental windows, not a single session percentile.'
    : '';
  return `Tick seq ${seq}: windowStart ${window}s, floor ${floor}, no closed snip this tick.${reused}`;
}

export async function runLiveTick(input: LiveTickInput): Promise<LiveTickResult> {
  const events: DemoEvent[] = [];
  const now = Date.now();
  events.push({
    at: now,
    name: 'chunkEncoded',
    detail: {
      seq: input.chunk.seq,
      start: input.chunk.startTime,
      end: input.chunk.endTime,
    },
  });

  const asBlobChunk: ChunkWithBlob = {
    ...input.chunk,
    blob: input.blob ?? placeholderBlob(),
  };
  const nextChunks = [...input.existingChunks.filter((c) => c.id !== input.chunk.id), asBlobChunk].sort(
    (a, b) => a.seq - b.seq
  );

  let analyzeMs = 0;
  let proposeMs = 0;
  let profiles = input.existingProfiles;
  let newChunksDecoded = 0;
  let profileReusedCount = 0;
  let error: string | undefined;
  let volumeFn = input.storedProfile
    ? 'analyzeVolumeIncremental (profileReused)'
    : 'analyzeVolumeIncremental → analyzeChunksVolume / analyzeVolume';

  try {
    const analyzeStarted = performance.now();
    if (input.blob || input.storedProfile) {
      const volume = await analyzeVolumeIncremental(input.existingProfiles, [
        { chunk: asBlobChunk, storedProfile: input.storedProfile },
      ]);
      profiles = volume.mergedProfiles;
      newChunksDecoded = volume.newChunksDecoded;
      profileReusedCount = volume.profileReused;
      if (newChunksDecoded > 0) {
        volumeFn = 'analyzeVolumeIncremental → analyzeChunksVolume (same decode as analyzeVolume)';
      }
    } else {
      error = 'no_chunks';
    }
    analyzeMs = performance.now() - analyzeStarted;
  } catch {
    error = 'chunk_decode_failed';
    analyzeMs = 0;
  }

  events.push({
    at: Date.now(),
    name: 'volumeUpdated',
    detail: {
      chunkCount: profiles.length,
      sampleCount: profiles.reduce((sum, profile) => sum + profile.samples.length, 0),
      newChunksDecoded,
      profileReused: profileReusedCount > 0,
      fn: 'analyzeVolumeForSession / analyzeVolumeIncremental',
    },
  });

  const proposeStarted = performance.now();
  const propose = proposeSnipsIncremental(profiles, nextChunks, input.frozenSnips, {
    ...input.options,
    includeTrailing: input.includeTrailing,
  });
  proposeMs = performance.now() - proposeStarted;

  events.push({
    at: Date.now(),
    name: 'snipsProposed',
    detail: {
      windowStartTime: propose.windowStartTime,
      includeTrailing: propose.includeTrailing,
      newlyClosedCount: propose.newlyClosed.length,
      trailingHeld: Boolean(propose.trailing),
      fn: 'proposeSnipsForSession / proposeSnipsIncremental',
      kernel: 'proposeSnipsFromProfile',
    },
  });

  const newFloorRows: FloorHistoryRow[] = propose.committedThisTick.map((snip, index) => ({
    snipId: (input.frozenSnips.length + index),
    closedAt: snip.endTime,
    windowStart: propose.windowStartTime,
    windowSamples: propose.windowSampleCount,
    floorDb: propose.adaptiveFloorDb,
    includeTrailing: propose.includeTrailing,
  }));

  for (const row of newFloorRows) {
    events.push({
      at: Date.now(),
      name: propose.includeTrailing && propose.trailing == null && input.includeTrailing
        ? 'snipFrozen'
        : 'snipFrozen',
      detail: {
        snipId: row.snipId,
        start: propose.committedThisTick[row.snipId - input.frozenSnips.length]?.startTime,
        end: row.closedAt,
        floorDb: row.floorDb,
      },
    });
  }

  if (input.includeTrailing) {
    events.push({
      at: Date.now(),
      name: 'trailingCommitted',
      detail: { count: propose.committedThisTick.length },
    });
  }

  const gaps = detectSilenceGaps(
    profiles,
    propose.adaptiveFloorDb ?? -40,
    input.options?.minSilenceGapDuration ?? 0.6
  );
  const gapCount = gaps.filter((gap) => gap.startTime >= propose.windowStartTime - 1e-6).length;

  const telemetry: TickTelemetry = {
    analyzeMs,
    proposeMs,
    floorDb: propose.adaptiveFloorDb,
    windowStartTime: propose.windowStartTime,
    windowSampleCount: propose.windowSampleCount,
    profileReused: profileReusedCount > 0,
    newChunksDecoded,
    analyzeFn: 'analyzeVolumeForSession / analyzeVolumeIncremental',
    proposeFn: 'proposeSnipsForSession / proposeSnipsIncremental',
    volumeFn,
    gapCount: propose.gapCount || gapCount,
    error: error || (profiles.length === 0 ? 'volume_profile_missing' : undefined),
  };

  return {
    profiles,
    chunks: nextChunks,
    propose,
    events,
    telemetry,
    reason: reasonForTick(input.chunk.seq, propose, profileReusedCount > 0, input.includeTrailing),
    newFloorRows,
  };
}

export function runCommitTick(input: {
  profiles: ChunkVolumeProfile[];
  chunks: ChunkWithBlob[];
  frozenSnips: Snip[];
  options?: SnipOptions;
  lastSeq: number;
  profileReused: boolean;
}): Omit<LiveTickResult, 'profiles' | 'chunks'> & { profiles: ChunkVolumeProfile[]; chunks: ChunkWithBlob[] } {
  const propose = proposeSnipsIncremental(input.profiles, input.chunks, input.frozenSnips, {
    ...input.options,
    includeTrailing: true,
  });
  const events: DemoEvent[] = [
    {
      at: Date.now(),
      name: 'snipsProposed',
      detail: {
        windowStartTime: propose.windowStartTime,
        includeTrailing: true,
        newlyClosedCount: propose.newlyClosed.length,
        trailingHeld: false,
        fn: 'proposeSnipsForSession / proposeSnipsIncremental',
      },
    },
    {
      at: Date.now(),
      name: 'trailingCommitted',
      detail: { count: propose.committedThisTick.length },
    },
  ];
  const newFloorRows: FloorHistoryRow[] = propose.committedThisTick.map((snip, index) => ({
    snipId: input.frozenSnips.length + index,
    closedAt: snip.endTime,
    windowStart: propose.windowStartTime,
    windowSamples: propose.windowSampleCount,
    floorDb: propose.adaptiveFloorDb,
    includeTrailing: true,
  }));
  for (const row of newFloorRows) {
    events.push({
      at: Date.now(),
      name: 'snipFrozen',
      detail: { snipId: row.snipId, end: row.closedAt, floorDb: row.floorDb },
    });
  }
  return {
    profiles: input.profiles,
    chunks: input.chunks,
    propose,
    events,
    telemetry: {
      analyzeMs: 0,
      proposeMs: 0,
      floorDb: propose.adaptiveFloorDb,
      windowStartTime: propose.windowStartTime,
      windowSampleCount: propose.windowSampleCount,
      profileReused: input.profileReused,
      newChunksDecoded: 0,
      analyzeFn: 'analyzeVolumeForSession / analyzeVolumeIncremental',
      proposeFn: 'proposeSnipsForSession / proposeSnipsIncremental',
      volumeFn: 'commit trailing only',
      gapCount: propose.gapCount,
    },
    reason: reasonForTick(input.lastSeq, propose, input.profileReused, true),
    newFloorRows,
  };
}

export function sessionEndFromChunks(chunks: ChunkMetadata[]): number {
  if (chunks.length === 0) return 0;
  return Math.max(...chunks.map((chunk) => chunk.endTime));
}

export function sampleWindowLabel(start: number, end: number): string {
  return `${start.toFixed(1)}s–${end.toFixed(1)}s`;
}

export { SAMPLE_WINDOW_MS };
