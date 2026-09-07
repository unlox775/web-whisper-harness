/**
 * Archive live-path replay used by Isolation Demo AND the 13-snip regression.
 *
 * Growing profiles per tick (never the full stored profile while chunks grow).
 * Every chunk except the last: includeTrailing false.
 * Last chunk tick: includeTrailing true (PWA Stop / proven 13-match path).
 *
 * Do not reimplement freeze / windowStartTime here — runLiveTick calls
 * proposeSnipsIncremental.
 */

import {
  proposeSnipsIncremental,
  type ChunkVolumeProfile,
  type ChunkWithBlob,
  type IncrementalProposeResult,
  type Snip,
} from './volumeAnalyzer';
import type { ReplayQueueItem } from './archiveSource';
import {
  runCommitTick,
  runLiveTick,
  type DemoEvent,
  type FloorHistoryRow,
  type LiveTickResult,
  type TickTelemetry,
} from './livePath';

export type ArchiveReplayState = {
  profiles: ChunkVolumeProfile[];
  chunks: ChunkWithBlob[];
  frozen: Snip[];
  trailing: Snip | null;
  includeTrailing: boolean;
  windowStartTime: number;
  adaptiveFloorDb: number | null;
  floorHistory: FloorHistoryRow[];
  events: DemoEvent[];
  telemetry: TickTelemetry | null;
  reason: string;
  lastSeq: number;
  profileReused: boolean;
};

export function emptyArchiveReplayState(): ArchiveReplayState {
  return {
    profiles: [],
    chunks: [],
    frozen: [],
    trailing: null,
    includeTrailing: false,
    windowStartTime: 0,
    adaptiveFloorDb: null,
    floorHistory: [],
    events: [],
    telemetry: null,
    reason: '',
    lastSeq: -1,
    profileReused: false,
  };
}

function applyTick(state: ArchiveReplayState, result: LiveTickResult, seq: number): ArchiveReplayState {
  return {
    profiles: result.profiles,
    chunks: result.chunks,
    frozen: result.propose.allCommitted,
    trailing: result.propose.trailing,
    includeTrailing: result.propose.includeTrailing,
    windowStartTime: result.propose.windowStartTime,
    adaptiveFloorDb: result.propose.adaptiveFloorDb,
    floorHistory: [...state.floorHistory, ...result.newFloorRows],
    events: [...state.events, ...result.events],
    telemetry: result.telemetry,
    reason: result.reason,
    lastSeq: seq,
    profileReused: result.telemetry.profileReused || state.profileReused,
  };
}

export async function stepArchiveReplay(
  state: ArchiveReplayState,
  item: ReplayQueueItem,
  includeTrailing: boolean
): Promise<ArchiveReplayState> {
  const chunk: ChunkWithBlob = {
    ...item.chunk,
    blob: item.blob ?? new Blob(),
  };
  const result = await runLiveTick({
    chunk,
    blob: item.playable ? item.blob : null,
    storedProfile: item.storedProfile,
    existingProfiles: state.profiles,
    existingChunks: state.chunks,
    frozenSnips: state.frozen,
    includeTrailing,
  });
  return applyTick(state, result, item.seq);
}

export function commitArchiveReplayTrailing(state: ArchiveReplayState): ArchiveReplayState {
  if (state.profiles.length === 0) {
    return { ...state, includeTrailing: true };
  }
  const result = runCommitTick({
    profiles: state.profiles,
    chunks: state.chunks,
    frozenSnips: state.frozen,
    lastSeq: state.lastSeq,
    profileReused: state.profileReused,
  });
  return applyTick(state, result, state.lastSeq);
}

/**
 * Auto-replay the archive queue the way Dave’s offline check matches live:
 * grow the profile one stored chunk at a time, includeTrailing true on the
 * last tick (not “full profile every tick”, not “last tick false only”).
 */
export async function replayArchiveLivePath(
  items: ReplayQueueItem[],
  initial: ArchiveReplayState = emptyArchiveReplayState()
): Promise<ArchiveReplayState> {
  let state = initial;
  for (let i = 0; i < items.length; i++) {
    const isLast = i === items.length - 1;
    state = await stepArchiveReplay(state, items[i], isLast);
  }
  if (state.trailing && !state.includeTrailing) {
    state = commitArchiveReplayTrailing(state);
  }
  return state;
}

/**
 * Wrong path Dave measured: pass the *full* stored profile on every tick
 * while chunk metadata grows. Yields 11 on the real BLT zip.
 */
export function replayWithFullProfileEveryTick(
  items: ReplayQueueItem[],
  fullProfiles: ChunkVolumeProfile[]
): { frozen: Snip[]; propose: IncrementalProposeResult | null } {
  let frozen: Snip[] = [];
  let chunks: ReplayQueueItem['chunk'][] = [];
  let last: IncrementalProposeResult | null = null;
  for (let i = 0; i < items.length; i++) {
    chunks = [...chunks, items[i].chunk];
    const isLast = i === items.length - 1;
    last = proposeSnipsIncremental(fullProfiles, chunks, frozen, {
      includeTrailing: isLast,
    });
    frozen = last.allCommitted;
  }
  return { frozen, propose: last };
}
