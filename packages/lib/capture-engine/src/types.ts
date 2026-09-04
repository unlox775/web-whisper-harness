export interface CaptureOptions {
  audioSource?: 'live' | 'simulated';
  chunkTargetDuration?: number;
  /** Start-only ghost timer in seconds. Default 10. Auto-stops with no_audio_received if no audio ever arrives. */
  watchdogTimeout?: number;
  /**
   * Mid-stream stall threshold in seconds. Default 5.
   * After audio has started, emit audioStalled if no PCM/progress arrives for this long.
   * Does not auto-stop.
   */
  stallTimeout?: number;
  inMemory?: boolean;
}

export interface CaptureHandle {
  stop: () => Promise<CaptureSummary>;
  /** Same as stop(): flush remainder, persist queued chunks, keep the session. */
  abort: () => Promise<CaptureSummary>;
  on: (eventName: string, callback: EventCallback) => void;
  off: (eventName: string, callback: EventCallback) => void;
  getStatus: () => CaptureStatus;
  /**
   * Isolation Demo / test hook: when true, incoming PCM is ignored so the
   * stall monitor can fire without a real mic ghost. Does not call stop().
   */
  setPcmPaused: (paused: boolean) => void;
}

export interface CaptureStatus {
  isActive: boolean;
  chunksEncoded: number;
  currentDuration: number;
  watchdogActive: boolean;
  watchdogRemaining: number;
  bufferSamples: number;
  /** True after audio started and no PCM/progress for stallTimeout. */
  stalled: boolean;
  /** Seconds since last PCM/progress while stalled; 0 when not stalled. */
  stalledFor: number;
}

export interface CaptureSummary {
  chunksWritten: number;
  totalDuration: number;
  hasAudio: boolean;
  sessionId: string;
}

export interface ChunkEncodedEvent {
  sessionId: string;
  seq: number;
  startTime: number;
  endTime: number;
  duration: number;
  byteLength: number;
  blob?: Blob;
}

export interface CaptureErrorEvent {
  sessionId: string;
  reason: string;
  details?: string;
}

export interface CaptureStoppedEvent {
  sessionId: string;
  chunksWritten: number;
  totalDuration: number;
  hasAudio: boolean;
}

/**
 * Emitted once when PCM/progress stops for stallTimeout after audio has started.
 * lastProgressAt is epoch milliseconds. Capture is NOT auto-stopped.
 */
export interface AudioStalledEvent {
  sessionId: string;
  stalledFor: number;
  lastProgressAt: number;
  chunksEncoded: number;
  pcmSeen: boolean;
  reason: 'mid_stream_stall';
}

/** Emitted once on the first PCM/progress after an audioStalled interval. */
export interface AudioResumedEvent {
  sessionId: string;
  stalledFor: number;
  chunksEncoded: number;
}

export type EventCallback = (data: any) => void;

export class CaptureError extends Error {
  constructor(public code: string, message: string, public details?: any) {
    super(message);
    this.name = 'CaptureError';
  }
}

export interface ChunkMetadata {
  seq: number;
  startTime: number;
  endTime: number;
  byteLength: number;
  sampleRate: number;
}
