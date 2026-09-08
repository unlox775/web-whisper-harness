/**
 * PWA re-export of the shared snip assembler.
 * Implementation lives in packages/lib/transcription-client/src/assembleSnipAudio.js
 * so Isolation Demo archive step-through and PWA Transcribe cannot drift.
 */

export {
  assembleSnipTranscriptionBlob,
  chunksOverlappingSnip,
  describeSnipTranscriptionJobs,
  encodePcmWav,
  exclusiveChunkIdsForSnip,
  planSnipAudioSlices,
  rangesOverlap,
  sliceDuration,
  transcriptionWindowsOverlap,
  wavDurationSeconds,
} from '../../../packages/lib/transcription-client/src/assembleSnipAudio.js';

export type SnipTimeRange = {
  id?: string;
  startTime: number;
  endTime: number;
  chunkIds?: string[];
};

export type ChunkTimeRange = {
  id: string;
  startTime: number;
  endTime: number;
  duration?: number;
  blob?: Blob | null;
};

export type AudioSlicePlan = {
  chunkId: string;
  chunkStartTime: number;
  chunkEndTime: number;
  /** Session time — inclusive start of the piece sent for this snip. */
  sliceStartTime: number;
  /** Session time — exclusive end of the piece sent for this snip. */
  sliceEndTime: number;
};

export type SnipTranscriptionJob = {
  snipId: string;
  startTime: number;
  endTime: number;
  /** Always 1: Transcribe never calls Groq per chunk or for the whole session. */
  groqCalls: 1;
  slices: AudioSlicePlan[];
  assembledDuration: number;
  overlappingChunkCount: number;
};

export type AssembledSnipAudio = {
  blob: Blob;
  kind: 'trimmed-wav' | 'concat-mp3';
  slices: AudioSlicePlan[];
};

export type DecodePcm = {
  channelData: Float32Array;
  sampleRate: number;
  duration: number;
};

export type AssembleSnipAudioOptions = {
  sessionChunks?: ChunkTimeRange[];
  getChunk?: (chunkId: string) => Promise<ChunkTimeRange | null>;
  decode?: (blob: Blob) => Promise<DecodePcm>;
};
