declare module '@web-whisper/session-store' {
  export type ParsedArchiveChunk = {
    meta: {
      id: string;
      seq: number;
      startTime: number;
      endTime: number;
      duration: number;
      mime?: string;
      sizeBytes?: number;
      audioPurgedAt?: number | null;
      file?: string | null;
    };
    blob: Blob | null;
  };

  export function parseSessionArchive(blob: Blob | Uint8Array | ArrayBuffer): Promise<{
    error?: string;
    formatVersion?: number;
    exportedAt?: string;
    session?: {
      id: string;
      chunkCount?: number;
      duration?: number;
      status?: string;
    };
    notes?: string;
    chunks?: ParsedArchiveChunk[];
  }>;
}

declare module '@web-whisper/capture-engine' {
  export class CaptureError extends Error {
    code: string;
    constructor(code: string, message: string, details?: unknown);
  }

  export interface CaptureHandle {
    stop: () => Promise<{
      chunksWritten: number;
      totalDuration: number;
      hasAudio: boolean;
      sessionId: string;
    }>;
    abort: () => Promise<unknown>;
    on: (eventName: string, callback: (data: any) => void) => void;
    off: (eventName: string, callback: (data: any) => void) => void;
    getStatus: () => {
      isActive: boolean;
      chunksEncoded: number;
      currentDuration: number;
      watchdogActive: boolean;
      watchdogRemaining: number;
      bufferSamples: number;
    };
  }

  export function startCapture(
    sessionId: string,
    options?: {
      audioSource?: 'live' | 'simulated';
      chunkTargetDuration?: number;
      watchdogTimeout?: number;
      inMemory?: boolean;
    }
  ): Promise<CaptureHandle>;
}

declare module '*.css';
