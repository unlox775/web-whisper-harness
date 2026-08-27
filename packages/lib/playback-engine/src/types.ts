export type PlaybackState = 'idle' | 'playing' | 'paused' | 'stopped';

export interface PlaybackHandle {
  state: PlaybackState;
  currentTime: number;
  duration: number;
  pause(): void;
  resume(): void;
  seek(time: number): void;
  stop(): void;
  setVolume(level: number): void;
  on(event: string, callback: (...args: any[]) => void): void;
  off(event: string, callback: (...args: any[]) => void): void;
}

export interface PlaybackError {
  error: string;
  [key: string]: any;
}

export interface SessionData {
  sessionId: string;
  chunkIds: string[];
  duration: number;
  createdAt: string;
}

export interface ChunkData {
  chunkId: string;
  sessionId: string;
  seq: number;
  startTime: number;
  endTime: number;
  duration: number;
  blob: Blob;
  blobSize: number;
}

export interface SnipData {
  snipId: string;
  sessionId: string;
  label: string;
  startTime: number;
  endTime: number;
  duration: number;
  chunkRefs: string[];
}

export interface PlaybackEvents {
  playing: { currentTime: number; duration: number };
  paused: { currentTime: number };
  timeupdate: { currentTime: number };
  seeked: { currentTime: number };
  ended: {};
  stopped: {};
  playbackError: { reason: string; detail?: any };
}
