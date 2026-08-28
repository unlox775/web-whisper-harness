export interface CaptureOptions {
  audioSource?: 'live' | 'simulated';
  chunkTargetDuration?: number;
  watchdogTimeout?: number;
  inMemory?: boolean;
}

export interface CaptureHandle {
  stop: () => Promise<CaptureSummary>;
  /** Same as stop(): flush remainder, persist queued chunks, keep the session. */
  abort: () => Promise<CaptureSummary>;
  on: (eventName: string, callback: EventCallback) => void;
  off: (eventName: string, callback: EventCallback) => void;
  getStatus: () => CaptureStatus;
}

export interface CaptureStatus {
  isActive: boolean;
  chunksEncoded: number;
  currentDuration: number;
  watchdogActive: boolean;
  watchdogRemaining: number;
  bufferSamples: number;
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
