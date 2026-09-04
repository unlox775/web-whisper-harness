declare module '@web-whisper/session-store' {
  export type ParsedSessionArchiveChunk = {
    meta: {
      id: string;
      seq: number;
      startTime: number;
      endTime: number;
      duration: number;
      mime: string;
      sizeBytes?: number;
      audioPurgedAt?: number | null;
      file?: string | null;
    };
    blob: Blob | null;
  };

  export type ParsedSessionArchive = {
    formatVersion: number;
    exportedAt: string;
    session: {
      id: string;
      duration?: number;
      chunkCount?: number;
      status?: string;
    };
    notes?: string;
    chunks: ParsedSessionArchiveChunk[];
  };

  export function parseSessionArchive(
    blob: Blob | Uint8Array | ArrayBuffer
  ): Promise<ParsedSessionArchive | { error: string }>;
}

declare module '@web-whisper/capture-engine' {
  export class CaptureError extends Error {
    code: string;
  }
  export function startCapture(
    sessionId: string,
    options?: {
      audioSource?: 'live' | 'simulated';
      chunkTargetDuration?: number;
      watchdogTimeout?: number;
      inMemory?: boolean;
    }
  ): Promise<{
    stop: () => Promise<{ chunksWritten: number; totalDuration: number }>;
    on: (eventName: string, callback: (data: any) => void) => void;
    getStatus: () => {
      isActive: boolean;
      chunksEncoded: number;
      currentDuration: number;
    };
  }>;
}

declare module '*.css';
