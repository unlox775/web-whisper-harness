import { MP3Encoder } from './encoder';
import { CaptureError } from './types';
import type {
  CaptureOptions,
  CaptureHandle,
  CaptureStatus,
  CaptureSummary,
  ChunkEncodedEvent,
  CaptureErrorEvent,
  CaptureStoppedEvent,
  AudioStalledEvent,
  AudioResumedEvent,
  EventCallback,
  ChunkMetadata,
  StoreWriteFailedDetails,
} from './types';

type EncoderLike = {
  encode(samples: Float32Array): Uint8Array;
  flush(): Uint8Array;
  createBlob(data: Uint8Array): Blob;
};

let createEncoder: (sampleRate: number) => EncoderLike = (sampleRate) =>
  new MP3Encoder(sampleRate, 128);

/** Test-only: Node lamejs needs browser globals; tests inject a stub encoder. */
export function setEncoderFactoryForTests(
  factory: ((sampleRate: number) => EncoderLike) | null
): void {
  createEncoder = factory ?? ((sampleRate) => new MP3Encoder(sampleRate, 128));
}

type SessionStoreLike = {
  writeChunk: (
    sessionId: string,
    chunkData: {
      seq: number;
      startTime: number;
      endTime: number;
      duration: number;
      blob: Blob;
      sizeBytes: number;
    }
  ) => Promise<{ chunkId?: string; error?: string; [key: string]: unknown }>;
  log?: (
    packageId: string,
    level: string,
    payload: string | (() => string | { message: string; details?: unknown }),
    options?: { sessionId?: string }
  ) => unknown;
};

let sessionStoreForTests: SessionStoreLike | null = null;

/** Test-only: inject writeChunk / log without opening IndexedDB. */
export function setSessionStoreForTests(store: SessionStoreLike | null): void {
  sessionStoreForTests = store;
  sessionStoreModule = null;
}

interface InternalChunk {
  seq: number;
  startTime: number;
  endTime: number;
  blob: Blob;
  byteLength: number;
}

class CaptureSession {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private silentGain: GainNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | OscillatorNode | null = null;
  private encoder: EncoderLike | null = null;
  
  private pcmBuffer: Float32Array[] = [];
  private totalSamples: number = 0;
  private chunkCount: number = 0;
  private sampleRate: number = 44100;
  private persistQueue: Promise<void> = Promise.resolve();
  private persistAbandoned = false;
  private stopPromise: Promise<CaptureSummary> | null = null;
  private lastSummary: CaptureSummary | null = null;
  
  private isActive: boolean = false;
  private watchdogTimer: ReturnType<typeof setTimeout> | null = null;
  private watchdogStartTime: number = 0;
  private watchdogCancelled: boolean = false;

  private pcmSeen: boolean = false;
  private lastProgressAt: number = 0;
  private stalled: boolean = false;
  private pcmPaused: boolean = false;
  private stallCheckTimer: ReturnType<typeof setInterval> | null = null;
  
  private eventHandlers: Map<string, Set<EventCallback>> = new Map();
  private inMemoryChunks: InternalChunk[] = [];
  
  constructor(
    private sessionId: string,
    private options: CaptureOptions
  ) {
    this.options = {
      audioSource: 'live',
      chunkTargetDuration: 4.0,
      watchdogTimeout: 10.0,
      stallTimeout: 5.0,
      inMemory: false,
      ...options,
    };
  }

  async start(): Promise<CaptureHandle> {
    if (this.isActive) {
      throw new CaptureError('already_capturing', 'Capture already active for this session');
    }

    try {
      this.audioContext = new AudioContext();
      this.sampleRate = this.audioContext.sampleRate;
      this.encoder = createEncoder(this.sampleRate);

      if (this.options.audioSource === 'live') {
        await this.setupLiveMicrophone();
      } else {
        this.setupSimulatedPCM();
      }

      this.isActive = true;
      this.startWatchdog();
      this.startStallMonitor();

      return this.createHandle();
    } catch (error: any) {
      if (error.name === 'NotAllowedError') {
        throw new CaptureError('permission_denied', 'User denied microphone permission');
      } else if (error.name === 'NotFoundError') {
        throw new CaptureError('no_microphone_found', 'No microphone device found');
      }
      throw error;
    }
  }

  private async setupLiveMicrophone(): Promise<void> {
    this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const source = this.audioContext!.createMediaStreamSource(this.mediaStream);
    this.sourceNode = source;
    this.connectProcessor(source);
  }

  private setupSimulatedPCM(): void {
    const oscillator = this.audioContext!.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(440, this.audioContext!.currentTime);
    this.sourceNode = oscillator;
    this.connectProcessor(oscillator);
    oscillator.start();
  }

  private connectProcessor(source: AudioNode): void {
    const bufferSize = 4096;
    this.scriptProcessor = this.audioContext!.createScriptProcessor(bufferSize, 1, 1);
    this.silentGain = this.audioContext!.createGain();
    this.silentGain.gain.value = 0;
    
    this.scriptProcessor.onaudioprocess = (event: AudioProcessingEvent) => {
      this.handleAudioProcess(event);
    };

    source.connect(this.scriptProcessor);
    this.scriptProcessor.connect(this.silentGain);
    this.silentGain.connect(this.audioContext!.destination);
  }

  private handleAudioProcess(event: AudioProcessingEvent): void {
    if (!this.isActive || this.pcmPaused) return;

    const inputBuffer = event.inputBuffer;
    const channelData = inputBuffer.getChannelData(0);
    const samples = new Float32Array(channelData);
    
    this.pcmBuffer.push(samples);
    this.totalSamples += samples.length;
    this.noteProgress();

    if (this.watchdogTimer && !this.watchdogCancelled) {
      this.cancelWatchdog();
    }

    const targetSampleCount = Math.round(this.options.chunkTargetDuration! * this.sampleRate);
    const bufferedSamples = this.pcmBuffer.reduce((sum, buf) => sum + buf.length, 0);

    if (bufferedSamples >= targetSampleCount) {
      this.encodeChunk(targetSampleCount);
    }
  }

  private encodeChunk(targetSampleCount: number, flush = false): void {
    const chunkSamples = new Float32Array(targetSampleCount);
    let offset = 0;
    let remaining = targetSampleCount;

    while (remaining > 0 && this.pcmBuffer.length > 0) {
      const buffer = this.pcmBuffer[0];
      const toCopy = Math.min(remaining, buffer.length);
      chunkSamples.set(buffer.subarray(0, toCopy), offset);
      offset += toCopy;
      remaining -= toCopy;

      if (toCopy === buffer.length) {
        this.pcmBuffer.shift();
      } else {
        this.pcmBuffer[0] = buffer.subarray(toCopy);
      }
    }

    try {
      let mp3Data = this.encoder!.encode(chunkSamples);
      if (flush) {
        const flushed = this.encoder!.flush();
        if (flushed.length > 0) {
          const combined = new Uint8Array(mp3Data.length + flushed.length);
          combined.set(mp3Data, 0);
          combined.set(flushed, mp3Data.length);
          mp3Data = combined;
        }
      }
      const blob = this.encoder!.createBlob(mp3Data);
      
      const duration = targetSampleCount / this.sampleRate;
      const startTime = (this.totalSamples - this.getRemainingBufferSamples() - targetSampleCount) / this.sampleRate;
      const endTime = startTime + duration;

      const metadata: ChunkMetadata = {
        seq: this.chunkCount,
        startTime,
        endTime,
        byteLength: blob.size,
        sampleRate: this.sampleRate,
      };

      if (this.options.inMemory) {
        this.inMemoryChunks.push({
          seq: this.chunkCount,
          startTime,
          endTime,
          blob,
          byteLength: blob.size,
        });
        this.emit('chunkEncoded', {
          sessionId: this.sessionId,
          seq: this.chunkCount,
          startTime,
          endTime,
          duration,
          byteLength: blob.size,
          blob,
        } as ChunkEncodedEvent);
      } else {
        this.enqueuePersist(blob, metadata, duration);
      }

      this.chunkCount++;
    } catch (error: any) {
      this.emit('captureError', {
        sessionId: this.sessionId,
        reason: 'encoding_failed',
        details: error.message,
      } as CaptureErrorEvent);
    }
  }

  private enqueuePersist(blob: Blob, metadata: ChunkMetadata, duration: number): void {
    if (this.persistAbandoned) return;

    this.persistQueue = this.persistQueue
      .catch(() => undefined)
      .then(async () => {
        if (this.persistAbandoned) return;
        try {
          const written = await this.writeChunkToStore(blob, metadata);
          if (!written) return;
          this.emit('chunkEncoded', {
            sessionId: this.sessionId,
            seq: metadata.seq,
            startTime: metadata.startTime,
            endTime: metadata.endTime,
            duration,
            byteLength: blob.size,
            blob,
          } as ChunkEncodedEvent);
        } catch (error: any) {
          // Never reject the shared persist tail — one job failure must not
          // skip later writeChunk jobs.
          this.emitStoreWriteFailed({
            error: error?.message || String(error),
          });
        }
      });
  }

  private async writeChunkToStore(blob: Blob, metadata: ChunkMetadata): Promise<boolean> {
    let retried = false;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const sessionStore = await loadSessionStore();
        const result = await sessionStore.writeChunk(this.sessionId, {
          seq: metadata.seq,
          startTime: metadata.startTime,
          endTime: metadata.endTime,
          duration: metadata.endTime - metadata.startTime,
          blob,
          sizeBytes: blob.size || metadata.byteLength,
        });
        if (result && result.error) {
          if (isTransientConflict(result) && attempt === 0) {
            retried = true;
            this.logCapture('warn', () => ({
              message: 'chunk persist retry',
              details: {
                sessionId: this.sessionId,
                seq: metadata.seq,
                error: result.error,
              },
            }));
            continue;
          }
          this.emitStoreWriteFailed(
            { ...result, retried: retried || undefined },
            result.error === 'session_not_found'
          );
          return false;
        }
        this.logCapture('debug', () => ({
          message: 'chunk persist ok',
          details: {
            sessionId: this.sessionId,
            seq: metadata.seq,
            sizeBytes: blob.size || metadata.byteLength,
          },
        }));
        return true;
      } catch (error: any) {
        if (isTransientConflict(error) && attempt === 0) {
          retried = true;
          this.logCapture('warn', () => ({
            message: 'chunk persist retry',
            details: {
              sessionId: this.sessionId,
              seq: metadata.seq,
              error: error?.name || error?.message || String(error),
            },
          }));
          continue;
        }
        console.error('Failed to write chunk to session-store:', error);
        this.emitStoreWriteFailed({
          error: error?.message || String(error),
          retried: retried || undefined,
        });
        return false;
      }
    }
    return false;
  }

  private emitStoreWriteFailed(
    details: StoreWriteFailedDetails,
    abandonSession = false
  ): void {
    this.logCapture('error', () => ({
      message: 'chunk persist failed',
      details: {
        sessionId: this.sessionId,
        error: details.error,
        retried: details.retried === true,
      },
    }));
    this.emit('captureError', {
      sessionId: this.sessionId,
      reason: 'store_write_failed',
      details,
    } as CaptureErrorEvent);
    if (abandonSession) {
      this.persistAbandoned = true;
      void this.stop();
    }
  }

  async flushPending(): Promise<void> {
    try {
      await this.persistQueue;
    } catch {
      // Queue jobs isolate their own failures; idle even if a stray rejection exists.
    }
    this.logCapture('debug', () => ({
      message: 'flushPending waited',
      details: { sessionId: this.sessionId },
    }));
  }

  private logCapture(
    level: 'debug' | 'warn' | 'error',
    payload: () => { message: string; details?: unknown }
  ): void {
    void loadSessionStoreIfAvailable()
      .then((store) => {
        if (!store || typeof store.log !== 'function') return;
        store.log('capture-engine', level, payload, { sessionId: this.sessionId });
      })
      .catch(() => undefined);
  }

  private getRemainingBufferSamples(): number {
    return this.pcmBuffer.reduce((sum, buf) => sum + buf.length, 0);
  }

  private startWatchdog(): void {
    this.watchdogStartTime = Date.now();
    this.watchdogCancelled = false;
    const timeout = this.options.watchdogTimeout! * 1000;
    
    this.watchdogTimer = setTimeout(() => {
      if (!this.watchdogCancelled && this.chunkCount === 0) {
        this.handleWatchdogTimeout();
      }
    }, timeout);
  }

  private cancelWatchdog(): void {
    this.watchdogCancelled = true;
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  private handleWatchdogTimeout(): void {
    this.emit('captureError', {
      sessionId: this.sessionId,
      reason: 'no_audio_received',
      details: 'Watchdog timeout: no audio received for ' + this.options.watchdogTimeout + 's',
    } as CaptureErrorEvent);
    
    void this.stop();
  }

  /**
   * Mid-stream stall monitor. Emits audioStalled once when PCM/progress has
   * been seen and then stops for stallTimeout. Never calls stop().
   * audioStalled is emitted once per stall interval; getStatus().stalled /
   * stalledFor stay pollable until PCM returns (audioResumed once).
   */
  private startStallMonitor(): void {
    this.stopStallMonitor();
    const stallMs = this.options.stallTimeout! * 1000;
    const intervalMs = Math.max(25, Math.min(250, stallMs / 4));
    this.stallCheckTimer = setInterval(() => this.checkStall(), intervalMs);
  }

  private stopStallMonitor(): void {
    if (this.stallCheckTimer) {
      clearInterval(this.stallCheckTimer);
      this.stallCheckTimer = null;
    }
  }

  private audioHasStarted(): boolean {
    return this.pcmSeen || this.chunkCount > 0;
  }

  private noteProgress(): void {
    if (this.stalled) {
      const stalledFor = this.lastProgressAt > 0
        ? (Date.now() - this.lastProgressAt) / 1000
        : 0;
      this.stalled = false;
      this.emit('audioResumed', {
        sessionId: this.sessionId,
        stalledFor,
        chunksEncoded: this.chunkCount,
      } as AudioResumedEvent);
    }
    this.pcmSeen = true;
    this.lastProgressAt = Date.now();
  }

  private checkStall(): void {
    if (!this.isActive || this.stalled || !this.audioHasStarted()) return;
    if (this.lastProgressAt <= 0) return;

    const stalledFor = (Date.now() - this.lastProgressAt) / 1000;
    if (stalledFor < this.options.stallTimeout!) return;

    this.stalled = true;
    this.emit('audioStalled', {
      sessionId: this.sessionId,
      stalledFor,
      lastProgressAt: this.lastProgressAt,
      chunksEncoded: this.chunkCount,
      pcmSeen: this.pcmSeen,
      reason: 'mid_stream_stall',
    } as AudioStalledEvent);
  }

  setPcmPaused(paused: boolean): void {
    this.pcmPaused = paused;
  }

  async stop(): Promise<CaptureSummary> {
    if (this.stopPromise) {
      return this.stopPromise;
    }
    if (!this.isActive) {
      if (this.lastSummary) return this.lastSummary;
      return {
        chunksWritten: this.chunkCount,
        totalDuration: this.totalSamples / this.sampleRate,
        hasAudio: this.chunkCount > 0,
        sessionId: this.sessionId,
      };
    }

    this.stopPromise = this.performStop();
    return this.stopPromise;
  }

  abort(): Promise<CaptureSummary> {
    return this.stop();
  }

  private async performStop(): Promise<CaptureSummary> {
    this.isActive = false;
    this.cancelWatchdog();
    this.stopStallMonitor();
    this.stalled = false;
    this.pcmPaused = false;

    const remainingSamples = this.getRemainingBufferSamples();
    if (remainingSamples > 0) {
      this.encodeChunk(remainingSamples, true);
    } else if (this.encoder) {
      try {
        const flushData = this.encoder.flush();
        if (flushData.length > 0) {
          const blob = this.encoder.createBlob(flushData);
          if (blob.size > 0) {
            const startTime = this.totalSamples / this.sampleRate;
            const metadata: ChunkMetadata = {
              seq: this.chunkCount,
              startTime,
              endTime: startTime,
              byteLength: blob.size,
              sampleRate: this.sampleRate,
            };
            const duration = 0;
            if (this.options.inMemory) {
              this.inMemoryChunks.push({
                seq: this.chunkCount,
                startTime,
                endTime: startTime,
                blob,
                byteLength: blob.size,
              });
              this.emit('chunkEncoded', {
                sessionId: this.sessionId,
                seq: this.chunkCount,
                startTime,
                endTime: startTime,
                duration,
                byteLength: blob.size,
                blob,
              } as ChunkEncodedEvent);
            } else {
              this.enqueuePersist(blob, metadata, duration);
            }
            this.chunkCount++;
          }
        }
      } catch (error) {
        console.error('Failed to flush encoder:', error);
      }
    }

    await this.flushPending();

    activeSessions.delete(this.sessionId);

    this.cleanup();

    const summary: CaptureSummary = {
      chunksWritten: this.chunkCount,
      totalDuration: this.totalSamples / this.sampleRate,
      hasAudio: this.chunkCount > 0,
      sessionId: this.sessionId,
    };

    this.lastSummary = summary;
    this.emit('captureStopped', summary as CaptureStoppedEvent);

    return summary;
  }

  private cleanup(): void {
    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect();
      this.scriptProcessor = null;
    }

    if (this.silentGain) {
      this.silentGain.disconnect();
      this.silentGain = null;
    }

    if (this.sourceNode) {
      if ('stop' in this.sourceNode) {
        (this.sourceNode as OscillatorNode).stop();
      }
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }

  getStatus(): CaptureStatus {
    const currentDuration = this.totalSamples / this.sampleRate;
    let watchdogRemaining = 0;
    
    if (this.watchdogTimer && !this.watchdogCancelled) {
      const elapsed = (Date.now() - this.watchdogStartTime) / 1000;
      watchdogRemaining = Math.max(0, this.options.watchdogTimeout! - elapsed);
    }

    const stalledFor = this.stalled && this.lastProgressAt > 0
      ? (Date.now() - this.lastProgressAt) / 1000
      : 0;

    return {
      isActive: this.isActive,
      chunksEncoded: this.chunkCount,
      currentDuration,
      watchdogActive: this.watchdogTimer !== null && !this.watchdogCancelled,
      watchdogRemaining,
      bufferSamples: this.getRemainingBufferSamples(),
      stalled: this.stalled,
      stalledFor,
    };
  }

  on(eventName: string, callback: EventCallback): void {
    if (!this.eventHandlers.has(eventName)) {
      this.eventHandlers.set(eventName, new Set());
    }
    this.eventHandlers.get(eventName)!.add(callback);
  }

  off(eventName: string, callback: EventCallback): void {
    const handlers = this.eventHandlers.get(eventName);
    if (handlers) {
      handlers.delete(callback);
    }
  }

  private emit(eventName: string, data: any): void {
    const handlers = this.eventHandlers.get(eventName);
    if (handlers) {
      handlers.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in event handler for ${eventName}:`, error);
        }
      });
    }
  }

  private createHandle(): CaptureHandle {
    return {
      stop: () => this.stop(),
      abort: () => this.abort(),
      on: (eventName, callback) => this.on(eventName, callback),
      off: (eventName, callback) => this.off(eventName, callback),
      getStatus: () => this.getStatus(),
      setPcmPaused: (paused) => this.setPcmPaused(paused),
      flushPending: () => this.flushPending(),
      whenPersistIdle: () => this.flushPending(),
    };
  }

  getInMemoryChunks(): InternalChunk[] {
    return this.inMemoryChunks;
  }

  clearInMemoryChunks(): void {
    this.inMemoryChunks.forEach(chunk => {
      URL.revokeObjectURL(URL.createObjectURL(chunk.blob));
    });
    this.inMemoryChunks = [];
  }
}

const activeSessions = new Map<string, CaptureSession>();

let sessionStoreModule: Promise<SessionStoreLike> | null = null;

function isTransientConflict(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as { error?: unknown; name?: unknown; message?: unknown };
  if (record.error === 'transaction_conflict') {
    return true;
  }
  const name = typeof record.name === 'string' ? record.name : '';
  const message = typeof record.message === 'string' ? record.message : '';
  if (name === 'AbortError' || name === 'ConstraintError') {
    return true;
  }
  return /transaction.+(abort|conflict)|abort.+transaction/i.test(message);
}

function loadSessionStore(): Promise<SessionStoreLike> {
  if (sessionStoreForTests) {
    return Promise.resolve(sessionStoreForTests);
  }
  if (!sessionStoreModule) {
    sessionStoreModule = import('../../../datastore/session-store/src/index.js');
  }
  return sessionStoreModule;
}

function loadSessionStoreIfAvailable(): Promise<SessionStoreLike | null> {
  if (sessionStoreForTests) {
    return Promise.resolve(sessionStoreForTests);
  }
  if (sessionStoreModule) {
    return sessionStoreModule;
  }
  return Promise.resolve(null);
}

/** Resolves when the persist queue is idle. No-op when no active capture. */
export async function flushPending(): Promise<void> {
  if (activeSessions.size === 0) {
    return;
  }
  await Promise.all(
    [...activeSessions.values()].map((session) => session.flushPending())
  );
}

/** Alias of flushPending. */
export function whenPersistIdle(): Promise<void> {
  return flushPending();
}

export async function startCapture(
  sessionId: string,
  options?: CaptureOptions
): Promise<CaptureHandle> {
  if (activeSessions.has(sessionId)) {
    throw new CaptureError('already_capturing', 'Capture already active for this session');
  }

  const session = new CaptureSession(sessionId, options || {});
  activeSessions.set(sessionId, session);
  
  try {
    const handle = await session.start();
    return handle;
  } catch (error) {
    activeSessions.delete(sessionId);
    throw error;
  }
}

export { CaptureError };
