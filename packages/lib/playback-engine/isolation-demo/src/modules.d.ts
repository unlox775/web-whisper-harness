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
