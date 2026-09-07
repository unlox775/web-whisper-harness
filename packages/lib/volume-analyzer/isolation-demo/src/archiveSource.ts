/**
 * Isolation Demo glue for session-store parseSessionArchive.
 * Maps parsed archive rows onto the same ChunkWithBlob shape live/fixture use.
 * Does not reimplement zip/manifest parsing.
 */

import {
  profilesFromStored,
  storedProfileHasPerChunkSamples,
  type ChunkMetadata,
  type ChunkVolumeProfile,
  type ChunkWithBlob,
} from './volumeAnalyzer';

export const ARCHIVE_ERROR_CANNOT_READ = 'Cannot read archive';
export const ARCHIVE_ERROR_UNSUPPORTED = 'Not a supported session archive';
export const ARCHIVE_ERROR_NO_AUDIO = 'No audio in archive to analyze';

export type ArchiveChunkEntry = {
  meta: {
    id: string;
    seq: number;
    startTime: number;
    endTime: number;
    duration: number;
  };
  blob: Blob | null;
};

export type ArchivedLiveSnip = {
  id: string;
  startTime: number;
  endTime: number;
  duration: number;
  chunkIds: string[];
  startChunkIndex?: number;
  endChunkIndex?: number;
  confidence?: number;
  text?: string;
};

export type ParsedSessionArchive = {
  error?: string;
  formatVersion?: number;
  exportedAt?: string;
  session?: {
    id: string;
    chunkCount?: number;
    duration?: number;
    hasSnips?: boolean;
    hasTranscript?: boolean;
    hasVolumeProfile?: boolean;
  };
  notes?: string;
  chunks?: ArchiveChunkEntry[];
  snips?: Array<Record<string, unknown>>;
  transcripts?: Array<{ snipId?: string; text?: string }>;
  snipsWithTranscripts?: Array<Record<string, unknown>>;
  volumeProfile?: unknown;
};

function asStoredVolumeProfile(value: unknown): {
  chunkVolumes?: Array<{
    chunkId: string;
    peakDb?: number;
    avgDb?: number;
    chunkIndex?: number;
    samples?: number[];
  }>;
} | undefined {
  if (!value || typeof value !== 'object') return undefined;
  return value as {
    chunkVolumes?: Array<{
      chunkId: string;
      peakDb?: number;
      avgDb?: number;
      chunkIndex?: number;
      samples?: number[];
    }>;
  };
}

export type ArchiveProfileMode = 'used' | 'present_no_samples' | 'missing';

export type ReplayQueueItem = {
  seq: number;
  chunk: ChunkMetadata;
  blob: Blob | null;
  storedProfile: ChunkVolumeProfile | null;
  playable: boolean;
};

export const ARCHIVE_PROFILE_NO_SAMPLES =
  'volume-profile.json present but no per-chunk samples — decode fallback';
export const ARCHIVE_PROFILE_MISSING = 'no volume-profile.json — decode fallback';

export function archiveProfileUsedMessage(count: number): string {
  return `volume-profile.json used (${count} chunk profiles, samples present)`;
}

export function describeArchiveProfileStatus(parsed: ParsedSessionArchive): {
  mode: ArchiveProfileMode;
  line: string;
} {
  const stored = asStoredVolumeProfile(parsed.volumeProfile);
  if (!stored?.chunkVolumes || stored.chunkVolumes.length === 0) {
    return { mode: 'missing', line: ARCHIVE_PROFILE_MISSING };
  }
  if (!storedProfileHasPerChunkSamples(stored)) {
    return { mode: 'present_no_samples', line: ARCHIVE_PROFILE_NO_SAMPLES };
  }
  return {
    mode: 'used',
    line: archiveProfileUsedMessage(stored.chunkVolumes.length),
  };
}

/**
 * Prefer archived volume-profile.json samples (same mapping as session.ts).
 * Profile-only rows (purged blob + samples) stay in the replay queue.
 */
export function buildArchiveReplayQueue(parsed: ParsedSessionArchive): {
  items: ReplayQueueItem[];
  profileMode: ArchiveProfileMode;
  statusLine: string;
} {
  const { mode, line } = describeArchiveProfileStatus(parsed);
  const storedVolume = asStoredVolumeProfile(parsed.volumeProfile);
  const rawRows = storedVolume?.chunkVolumes ?? [];
  const rawById = new Map(rawRows.map((row) => [String(row.chunkId), row]));
  const storedProfiles = storedVolume ? profilesFromStored(storedVolume) : [];
  const byId = new Map(storedProfiles.map((profile) => [profile.chunkId, profile]));
  const entries = [...(parsed.chunks ?? [])].sort((a, b) => a.meta.seq - b.meta.seq);

  const items: ReplayQueueItem[] = [];
  for (const entry of entries) {
    const raw = rawById.get(String(entry.meta.id));
    const hasSamples = Array.isArray(raw?.samples) && raw.samples.length > 0;
    const stored = hasSamples ? byId.get(String(entry.meta.id)) ?? null : null;
    const blob = entry.blob;
    if (!blob && !hasSamples) continue;
    items.push({
      seq: Number(entry.meta.seq),
      chunk: {
        id: String(entry.meta.id),
        seq: Number(entry.meta.seq),
        startTime: Number(entry.meta.startTime),
        endTime: Number(entry.meta.endTime),
        duration: Number(entry.meta.duration),
      },
      blob,
      storedProfile: stored,
      playable: blob != null,
    });
  }

  return { items, profileMode: mode, statusLine: line };
}

const UNSUPPORTED_PARSE_ERRORS = new Set([
  'kind_mismatch',
  'unsupported_format_version',
  'invalid_manifest',
  'missing_manifest',
  'corrupt_json',
]);

/**
 * Map parseSessionArchive error codes to the spec's user-visible copy.
 */
export function messageForArchiveParseError(error: string | undefined): string {
  if (error && UNSUPPORTED_PARSE_ERRORS.has(error)) {
    return ARCHIVE_ERROR_UNSUPPORTED;
  }
  return ARCHIVE_ERROR_CANNOT_READ;
}

/**
 * Keep playable (non-null blob) chunks, in seq order, as ChunkWithBlob.
 * Purged rows (blob: null) are skipped.
 */
export function mapArchiveChunksToAnalyze(parsed: ParsedSessionArchive): ChunkWithBlob[] {
  const entries = parsed.chunks ?? [];
  return entries
    .filter((entry): entry is ArchiveChunkEntry & { blob: Blob } => entry.blob != null)
    .map((entry) => ({
      id: String(entry.meta.id),
      seq: Number(entry.meta.seq),
      startTime: Number(entry.meta.startTime),
      endTime: Number(entry.meta.endTime),
      duration: Number(entry.meta.duration),
      blob: entry.blob,
    }))
    .sort((a, b) => a.seq - b.seq);
}

function asFiniteNumber(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function normalizeArchivedSnip(raw: Record<string, unknown>, text?: string): ArchivedLiveSnip | null {
  const id = raw.id != null ? String(raw.id) : '';
  const startTime = asFiniteNumber(raw.startTime);
  const endTime = asFiniteNumber(raw.endTime);
  const duration = asFiniteNumber(raw.duration);
  if (!id || startTime == null || endTime == null || duration == null) {
    return null;
  }
  const chunkIds = Array.isArray(raw.chunkIds) ? raw.chunkIds.map((value) => String(value)) : [];
  const joined: ArchivedLiveSnip = {
    id,
    startTime,
    endTime,
    duration,
    chunkIds,
  };
  const startChunkIndex = asFiniteNumber(raw.startChunkIndex);
  const endChunkIndex = asFiniteNumber(raw.endChunkIndex);
  const confidence = asFiniteNumber(raw.confidence);
  if (startChunkIndex != null) joined.startChunkIndex = startChunkIndex;
  if (endChunkIndex != null) joined.endChunkIndex = endChunkIndex;
  if (confidence != null) joined.confidence = confidence;
  if (typeof text === 'string') joined.text = text;
  else if (typeof raw.text === 'string') joined.text = raw.text;
  return joined;
}

/**
 * Live snip ranges from parseSessionArchive optional payload.
 * Prefers `snipsWithTranscripts`; otherwise joins `transcripts[].text` on snipId.
 * Empty / missing optional files → [] (slim v1 zip behaves as today).
 */
export function mapArchivedLiveSnips(parsed: ParsedSessionArchive): ArchivedLiveSnip[] {
  const joined = Array.isArray(parsed.snipsWithTranscripts) ? parsed.snipsWithTranscripts : null;
  if (joined && joined.length > 0) {
    return joined
      .map((row) => (row && typeof row === 'object' ? normalizeArchivedSnip(row) : null))
      .filter((row): row is ArchivedLiveSnip => row != null);
  }

  const snips = Array.isArray(parsed.snips) ? parsed.snips : [];
  if (snips.length === 0) return [];

  const textBySnipId = new Map<string, string>();
  if (Array.isArray(parsed.transcripts)) {
    for (const row of parsed.transcripts) {
      if (!row || row.snipId == null) continue;
      textBySnipId.set(String(row.snipId), typeof row.text === 'string' ? row.text : '');
    }
  }

  return snips
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const id = row.id != null ? String(row.id) : '';
      return normalizeArchivedSnip(row, textBySnipId.has(id) ? textBySnipId.get(id) : undefined);
    })
    .filter((row): row is ArchivedLiveSnip => row != null);
}

/**
 * Status chip note after upload. Slim zips with hasSnips:true still have no live ranges.
 */
export function archiveLiveRangesStatusNote(
  parsed: ParsedSessionArchive,
  liveCount: number
): string | null {
  if (liveCount > 0) {
    return `Live (archived): ${liveCount} snip${liveCount === 1 ? '' : 's'}`;
  }
  if (parsed.session?.hasSnips) {
    return 'hasSnips is a flag only — live ranges were not exported';
  }
  return null;
}
