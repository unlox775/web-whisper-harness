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
  FlushPendingResult,
  LostChunk,
  ChunkLostEvent,
  PersistBackpressureEvent,
  DecodedAudio,
  ImportAudioOptions,
  ImportProgress,
  ImportSummary,
} from './types';

/** Minimum pending-buffer size: ≥ 5 minutes of 4 s chunks. */
const PENDING_BUFFER_MIN_CHUNKS = 75;
/** Emit persist_backpressure when the buffer nears that capacity. */
const PENDING_BACKPRESSURE_CHUNKS = PENDING_BUFFER_MIN_CHUNKS - 7;
/** Minimum per-chunk retry window. Keep retrying past this while the session is live. */
const PERSIST_RETRY_WINDOW_MS = 30_000;
const PERSIST_BACKOFF_START_MS = 250;
const PERSIST_BACKOFF_CAP_MS = 4_000;

const EMPTY_FLUSH: FlushPendingResult = { savedCount: 0, lostChunks: [] };

type EncoderLike = {
  encode(samples: Float32Array): Uint8Array;
  flush(): Uint8Array;
  createBlob(data: Uint8Array): Blob;
};

/** Live capture runs at 44.1/48 kHz (128 kbps). Imports default to 16 kHz (MPEG-2, 64 kbps). */
function defaultBitrate(sampleRate: number): number {
  return sampleRate <= 24000 ? 64 : 128;
}

let createEncoder: (sampleRate: number) => EncoderLike = (sampleRate) =>
  new MP3Encoder(sampleRate, defaultBitrate(sampleRate));

/** Test-only: Node lamejs needs browser globals; tests inject a stub encoder. */
export function setEncoderFactoryForTests(
  factory: ((sampleRate: number) => EncoderLike) | null
): void {
  createEncoder = factory ?? ((sampleRate) => new MP3Encoder(sampleRate, defaultBitrate(sampleRate)));
}

type SessionStoreWriteResult = {
  chunkId?: string;
  error?: string;
  class?: 'transient' | 'permanent';
  [key: string]: unknown;
};

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
  ) => Promise<SessionStoreWriteResult>;
  recordChunkLost?: (
    sessionId: string,
    loss: { seq: number; startMs: number; endMs: number; reason: string }
  ) => Promise<{ recorded?: boolean; error?: string; class?: string }>;
  log?: (
    packageId: string,
    level: string,
    payload: string | (() => string | { message: string; details?: unknown }),
    options?: { sessionId?: string }
  ) => unknown;
};

interface PendingPersist {
  blob: Blob;
  metadata: ChunkMetadata;
  duration: number;
  firstAttemptAt: number | null;
  backoffMs: number;
}

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
  private pending: PendingPersist[] = [];
  private drainTail: Promise<void> = Promise.resolve();
  private persistSavedCount = 0;
  private persistLostChunks: LostChunk[] = [];
  private sleepCancel: (() => void) | null = null;
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
    this.pending.push({
      blob,
      metadata,
      duration,
      firstAttemptAt: null,
      backoffMs: PERSIST_BACKOFF_START_MS,
    });
    if (this.pending.length >= PENDING_BACKPRESSURE_CHUNKS) {
      this.emit('persist_backpressure', {
        pendingCount: this.pending.length,
        oldestSeq: this.pending[0].metadata.seq,
      } as PersistBackpressureEvent);
    }
    this.kickDrain();
  }

  private kickDrain(): void {
    this.drainTail = this.drainTail
      .catch(() => undefined)
      .then(() => this.drainPending());
  }

  private async drainPending(): Promise<void> {
    while (this.pending.length > 0) {
      const job = this.pending[0];
      const outcome = await this.persistOne(job);
      if (outcome === 'retry') {
        await this.sleepPersist(job.backoffMs);
        job.backoffMs = Math.min(job.backoffMs * 2, PERSIST_BACKOFF_CAP_MS);
        continue;
      }
      this.pending.shift();
      if (outcome === 'saved') {
        this.persistSavedCount += 1;
        this.emit('chunkEncoded', {
          sessionId: this.sessionId,
          seq: job.metadata.seq,
          startTime: job.metadata.startTime,
          endTime: job.metadata.endTime,
          duration: job.duration,
          byteLength: job.blob.size,
          blob: job.blob,
        } as ChunkEncodedEvent);
      }
    }
  }

  private async persistOne(job: PendingPersist): Promise<'saved' | 'lost' | 'retry'> {
    if (job.firstAttemptAt == null) {
      job.firstAttemptAt = Date.now();
    }
    try {
      const sessionStore = await loadSessionStore();
      const result = await sessionStore.writeChunk(this.sessionId, {
        seq: job.metadata.seq,
        startTime: job.metadata.startTime,
        endTime: job.metadata.endTime,
        duration: job.metadata.endTime - job.metadata.startTime,
        blob: job.blob,
        sizeBytes: job.blob.size || job.metadata.byteLength,
      });
      if (result && result.error) {
        if (isPermanentStoreError(result) || this.retryWindowExhausted(job)) {
          await this.declareLost(job, String(result.error));
          return 'lost';
        }
        this.logCapture('warn', () => ({
          message: 'chunk persist retry',
          details: {
            sessionId: this.sessionId,
            seq: job.metadata.seq,
            error: result.error,
            class: result.class || 'transient',
          },
        }));
        return 'retry';
      }
      this.logCapture('debug', () => ({
        message: 'chunk persist ok',
        details: {
          sessionId: this.sessionId,
          seq: job.metadata.seq,
          sizeBytes: job.blob.size || job.metadata.byteLength,
        },
      }));
      return 'saved';
    } catch (error: any) {
      const reason = error?.message || String(error);
      if (this.retryWindowExhausted(job)) {
        await this.declareLost(job, reason);
        return 'lost';
      }
      this.logCapture('warn', () => ({
        message: 'chunk persist retry',
        details: {
          sessionId: this.sessionId,
          seq: job.metadata.seq,
          error: reason,
          class: 'transient',
        },
      }));
      return 'retry';
    }
  }

  private retryWindowExhausted(job: PendingPersist): boolean {
    if (job.firstAttemptAt == null) return false;
    if (Date.now() - job.firstAttemptAt < PERSIST_RETRY_WINDOW_MS) return false;
    // Keep retrying past the minimum window while the session is live.
    // After stop(), flushPending may declare lost once the window has elapsed.
    return !this.isActive;
  }

  private async declareLost(job: PendingPersist, reason: string): Promise<void> {
    const lost: LostChunk = {
      seq: job.metadata.seq,
      startMs: Math.round(job.metadata.startTime * 1000),
      endMs: Math.round(job.metadata.endTime * 1000),
      reason,
    };
    this.persistLostChunks.push(lost);
    this.logCapture('error', () => ({
      message: 'chunk_lost',
      details: {
        sessionId: this.sessionId,
        seq: lost.seq,
        startMs: lost.startMs,
        endMs: lost.endMs,
        reason: lost.reason,
      },
    }));
    this.emit('chunk_lost', {
      sessionId: this.sessionId,
      ...lost,
    } as ChunkLostEvent);
    try {
      const store = await loadSessionStore();
      if (typeof store.recordChunkLost === 'function') {
        await store.recordChunkLost(this.sessionId, lost);
      }
    } catch {
      // Loss is already reported; a failed record must not reject the drain.
    }
    if (reason === 'session_not_found') {
      this.isActive = false;
      this.cancelWatchdog();
      this.stopStallMonitor();
    }
  }

  private sleepPersist(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.sleepCancel = null;
        resolve();
      }, ms);
      this.sleepCancel = () => {
        clearTimeout(timer);
        this.sleepCancel = null;
        resolve();
      };
    });
  }

  async flushPending(): Promise<FlushPendingResult> {
    this.kickDrain();
    try {
      await this.drainTail;
    } catch {
      // Drain isolates per-chunk outcomes; idle even if a stray rejection exists.
    }
    while (this.pending.length > 0) {
      this.kickDrain();
      try {
        await this.drainTail;
      } catch {
        break;
      }
    }
    this.logCapture('debug', () => ({
      message: 'flushPending waited',
      details: {
        sessionId: this.sessionId,
        savedCount: this.persistSavedCount,
        lostCount: this.persistLostChunks.length,
      },
    }));
    return {
      savedCount: this.persistSavedCount,
      lostChunks: this.persistLostChunks.slice(),
    };
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
    this.sleepCancel?.();
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

  /**
   * Audio file import: feed decoded PCM through the same encoder + durable
   * persist queue as live capture. Backpressure (never drop); resolves after
   * every chunk is saved or declared lost.
   */
  async runImport(
    decoded: DecodedAudio,
    onProgress?: (progress: ImportProgress) => void
  ): Promise<ImportSummary> {
    const sampleRate = decoded.sampleRate;
    const channels = decoded.channels.filter((ch) => ch && ch.length > 0);
    const length = channels.reduce((max, ch) => Math.max(max, ch.length), 0);
    if (!length || !sampleRate) {
      throw new CaptureError('empty_audio', 'Decoded audio has no samples');
    }
    this.sampleRate = sampleRate;
    this.encoder = createEncoder(sampleRate);
    this.isActive = true;
    this.pcmSeen = true;

    const target = Math.max(1, Math.round(this.options.chunkTargetDuration! * sampleRate));
    const totalChunks = Math.ceil(length / target);
    const duration = length / sampleRate;
    const report = (phase: ImportProgress['phase']) => {
      if (!onProgress) return;
      try {
        onProgress({
          phase,
          chunksEncoded: this.chunkCount,
          chunksSaved: this.persistSavedCount,
          totalChunks,
          duration,
        });
      } catch {
        // progress callbacks never break the import
      }
    };
    report('encoding');

    try {
      for (let index = 0; index < totalChunks; index++) {
        const from = index * target;
        const to = Math.min(length, from + target);
        const mono = mixChunkToMono(channels, from, to);
        this.pcmBuffer.push(mono);
        this.totalSamples += mono.length;
        this.encodeChunk(mono.length, index === totalChunks - 1);
        report('encoding');
        // Backpressure: hold encoding while the persist queue is backed up.
        while (this.pending.length >= IMPORT_MAX_PENDING) {
          await new Promise((resolve) => setTimeout(resolve, 15));
          report('saving');
        }
        // Yield so the UI can paint progress.
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    } finally {
      this.isActive = false;
    }

    report('saving');
    const flushed = await this.flushPending();
    activeSessions.delete(this.sessionId);
    report('saving');

    const summary: ImportSummary = {
      sessionId: this.sessionId,
      chunksWritten: flushed.savedCount,
      totalDuration: duration,
      hasAudio: flushed.savedCount > 0,
      sampleRate,
      lostChunks: flushed.lostChunks,
    };
    this.lastSummary = {
      chunksWritten: summary.chunksWritten,
      totalDuration: summary.totalDuration,
      hasAudio: summary.hasAudio,
      sessionId: this.sessionId,
    };
    this.logCapture('debug', () => ({
      message: 'import done',
      details: {
        sessionId: this.sessionId,
        chunksWritten: summary.chunksWritten,
        lostCount: summary.lostChunks.length,
        duration,
        sampleRate,
      },
    }));
    return summary;
  }

  logImport(level: 'debug' | 'warn' | 'error', payload: () => { message: string; details?: unknown }): void {
    this.logCapture(level, payload);
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

const PERMANENT_STORE_ERRORS = new Set([
  'session_not_found',
  'quota_exceeded',
  'database_unavailable',
]);

function isPermanentStoreError(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as { error?: unknown; class?: unknown };
  if (record.class === 'permanent') {
    return true;
  }
  return typeof record.error === 'string' && PERMANENT_STORE_ERRORS.has(record.error);
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

/** Resolves when every pending chunk is saved or declared lost. No-op when idle. */
export async function flushPending(): Promise<FlushPendingResult> {
  if (activeSessions.size === 0) {
    return { ...EMPTY_FLUSH };
  }
  const results = await Promise.all(
    [...activeSessions.values()].map((session) => session.flushPending())
  );
  return {
    savedCount: results.reduce((sum, result) => sum + result.savedCount, 0),
    lostChunks: results.flatMap((result) => result.lostChunks),
  };
}

/** Alias of flushPending. */
export function whenPersistIdle(): Promise<FlushPendingResult> {
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

const IMPORT_MAX_PENDING = 8;
const DEFAULT_IMPORT_SAMPLE_RATE = 16000;

function mixChunkToMono(channels: Float32Array[], from: number, to: number): Float32Array {
  const out = new Float32Array(to - from);
  if (channels.length === 1) {
    out.set(channels[0].subarray(from, Math.min(to, channels[0].length)));
    return out;
  }
  const scale = 1 / channels.length;
  for (const channel of channels) {
    const end = Math.min(to, channel.length);
    for (let i = from; i < end; i++) {
      out[i - from] += channel[i] * scale;
    }
  }
  return out;
}

type OfflineCtxCtor = new (channels: number, length: number, sampleRate: number) => BaseAudioContext;

async function defaultDecode(bytes: ArrayBuffer, sampleRate: number): Promise<DecodedAudio> {
  const g = globalThis as unknown as {
    OfflineAudioContext?: OfflineCtxCtor;
    webkitOfflineAudioContext?: OfflineCtxCtor;
    AudioContext?: new () => AudioContext;
    webkitAudioContext?: new () => AudioContext;
  };
  const Offline = g.OfflineAudioContext || g.webkitOfflineAudioContext;
  let context: BaseAudioContext;
  let close: () => Promise<void> = async () => undefined;
  if (Offline) {
    context = new Offline(1, 1, sampleRate);
  } else {
    const Live = g.AudioContext || g.webkitAudioContext;
    if (!Live) {
      throw new CaptureError('audio_context_unavailable', 'Web Audio is not available');
    }
    const live = new Live();
    context = live;
    close = () => live.close().catch(() => undefined);
  }
  try {
    const buffer = await new Promise<AudioBuffer>((resolve, reject) => {
      try {
        const maybe = context.decodeAudioData(bytes, resolve, reject);
        if (maybe && typeof (maybe as Promise<AudioBuffer>).then === 'function') {
          (maybe as Promise<AudioBuffer>).then(resolve, reject);
        }
      } catch (error) {
        reject(error);
      }
    });
    const channels: Float32Array[] = [];
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      channels.push(buffer.getChannelData(ch));
    }
    return { sampleRate: buffer.sampleRate, channels };
  } finally {
    await close();
  }
}

/**
 * Import an audio file (m4a/AAC, mp3, wav, webm — whatever the browser's
 * decodeAudioData reads) into the session as the same durable ~4 s MP3
 * chunks a live take produces. See
 * docs/specs/20261127053800-feedback-import-audio-file-to-durable-chunks.md
 */
export async function importAudioFile(
  sessionId: string,
  file: Blob | ArrayBuffer,
  options: ImportAudioOptions = {}
): Promise<ImportSummary> {
  if (activeSessions.has(sessionId)) {
    throw new CaptureError('already_capturing', 'Capture already active for this session');
  }
  const session = new CaptureSession(sessionId, {
    chunkTargetDuration: options.chunkTargetDuration ?? 4.0,
    inMemory: false,
  });
  activeSessions.set(sessionId, session);
  try {
    const decodeRate = options.decodeSampleRate ?? DEFAULT_IMPORT_SAMPLE_RATE;
    const size = file instanceof ArrayBuffer ? file.byteLength : file.size;
    const mime = file instanceof ArrayBuffer ? '' : file.type;
    session.logImport('debug', () => ({
      message: 'import start',
      details: { sessionId, bytes: size, mime, decodeRate },
    }));
    options.onProgress?.({ phase: 'decoding', chunksEncoded: 0, chunksSaved: 0, totalChunks: 0, duration: 0 });
    const bytes = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
    let decoded: DecodedAudio;
    try {
      decoded = await (options.decode ?? defaultDecode)(bytes, decodeRate);
    } catch (error: any) {
      if (error instanceof CaptureError && error.code === 'audio_context_unavailable') throw error;
      const reason = error?.message || error?.name || String(error);
      session.logImport('error', () => ({
        message: 'import decode failed',
        details: { sessionId, bytes: size, mime, reason },
      }));
      throw new CaptureError('decode_failed', `Could not decode audio: ${reason}`);
    }
    session.logImport('debug', () => ({
      message: 'import decoded',
      details: {
        sessionId,
        sampleRate: decoded.sampleRate,
        channels: decoded.channels.length,
        duration: (decoded.channels[0]?.length ?? 0) / (decoded.sampleRate || 1),
      },
    }));
    return await session.runImport(decoded, options.onProgress);
  } finally {
    // runImport removes itself after flush; a throw before any chunk leaves nothing pending.
    if (activeSessions.get(sessionId) === session) {
      await session.flushPending().catch(() => undefined);
      activeSessions.delete(sessionId);
    }
  }
}

export { CaptureError };
