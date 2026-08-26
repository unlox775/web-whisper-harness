import { MP3Encoder } from './encoder';
import type {
  CaptureOptions,
  CaptureHandle,
  CaptureStatus,
  CaptureSummary,
  CaptureError,
  ChunkEncodedEvent,
  CaptureErrorEvent,
  CaptureStoppedEvent,
  EventCallback,
  ChunkMetadata,
} from './types';

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
  private sourceNode: MediaStreamAudioSourceNode | OscillatorNode | null = null;
  private encoder: MP3Encoder | null = null;
  
  private pcmBuffer: Float32Array[] = [];
  private totalSamples: number = 0;
  private chunkCount: number = 0;
  private sampleRate: number = 44100;
  
  private isActive: boolean = false;
  private watchdogTimer: NodeJS.Timeout | null = null;
  private watchdogStartTime: number = 0;
  private watchdogCancelled: boolean = false;
  
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
      this.encoder = new MP3Encoder(this.sampleRate, 128);

      if (this.options.audioSource === 'live') {
        await this.setupLiveMicrophone();
      } else {
        this.setupSimulatedPCM();
      }

      this.isActive = true;
      this.startWatchdog();

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
    
    this.scriptProcessor.onaudioprocess = (event: AudioProcessingEvent) => {
      this.handleAudioProcess(event);
    };

    source.connect(this.scriptProcessor);
    this.scriptProcessor.connect(this.audioContext!.destination);
  }

  private handleAudioProcess(event: AudioProcessingEvent): void {
    if (!this.isActive) return;

    const inputBuffer = event.inputBuffer;
    const channelData = inputBuffer.getChannelData(0);
    const samples = new Float32Array(channelData);
    
    this.pcmBuffer.push(samples);
    this.totalSamples += samples.length;

    if (this.watchdogTimer && !this.watchdogCancelled) {
      this.cancelWatchdog();
    }

    const targetSampleCount = Math.round(this.options.chunkTargetDuration! * this.sampleRate);
    const bufferedSamples = this.pcmBuffer.reduce((sum, buf) => sum + buf.length, 0);

    if (bufferedSamples >= targetSampleCount) {
      this.encodeChunk(targetSampleCount);
    }
  }

  private encodeChunk(targetSampleCount: number): void {
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
      const mp3Data = this.encoder!.encode(chunkSamples);
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
      } else {
        this.writeChunkToStore(blob, metadata);
      }

      this.emit('chunkEncoded', {
        sessionId: this.sessionId,
        seq: this.chunkCount,
        startTime,
        endTime,
        duration,
        byteLength: blob.size,
        blob: this.options.inMemory ? blob : undefined,
      } as ChunkEncodedEvent);

      this.chunkCount++;
    } catch (error: any) {
      this.emit('captureError', {
        sessionId: this.sessionId,
        reason: 'encoding_failed',
        details: error.message,
      } as CaptureErrorEvent);
    }
  }

  private async writeChunkToStore(blob: Blob, metadata: ChunkMetadata): Promise<void> {
    try {
      // Dynamically import session-store if available
      const sessionStore = await import('../../../datastore/session-store/src/index').catch(() => null);
      if (sessionStore && sessionStore.writeChunk) {
        await sessionStore.writeChunk(this.sessionId, blob, metadata);
      }
    } catch (error: any) {
      console.error('Failed to write chunk to session-store:', error);
      this.emit('captureError', {
        sessionId: this.sessionId,
        reason: 'store_write_failed',
        details: error.message,
      } as CaptureErrorEvent);
    }
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
    
    this.stop();
  }

  async stop(): Promise<CaptureSummary> {
    if (!this.isActive) {
      throw new CaptureError('invalid_handle', 'Capture handle is not active');
    }

    this.isActive = false;
    this.cancelWatchdog();

    const remainingSamples = this.getRemainingBufferSamples();
    if (remainingSamples > 0) {
      this.encodeChunk(remainingSamples);
    }

    if (this.encoder) {
      try {
        const flushData = this.encoder.flush();
        if (flushData.length > 0) {
          const blob = this.encoder.createBlob(flushData);
          if (blob.size > 0 && remainingSamples === 0) {
            const duration = remainingSamples / this.sampleRate;
            const startTime = this.totalSamples / this.sampleRate;
            
            if (this.options.inMemory) {
              this.inMemoryChunks.push({
                seq: this.chunkCount,
                startTime,
                endTime: startTime + duration,
                blob,
                byteLength: blob.size,
              });
            }
          }
        }
      } catch (error) {
        console.error('Failed to flush encoder:', error);
      }
    }

    this.cleanup();

    const summary: CaptureSummary = {
      chunksWritten: this.chunkCount,
      totalDuration: this.totalSamples / this.sampleRate,
      hasAudio: this.chunkCount > 0,
      sessionId: this.sessionId,
    };

    this.emit('captureStopped', summary as CaptureStoppedEvent);

    return summary;
  }

  private cleanup(): void {
    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect();
      this.scriptProcessor = null;
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

    return {
      isActive: this.isActive,
      chunksEncoded: this.chunkCount,
      currentDuration,
      watchdogActive: this.watchdogTimer !== null && !this.watchdogCancelled,
      watchdogRemaining,
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
      on: (eventName, callback) => this.on(eventName, callback),
      off: (eventName, callback) => this.off(eventName, callback),
      getStatus: () => this.getStatus(),
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

export { CaptureError, CaptureOptions, CaptureHandle, CaptureStatus, CaptureSummary };
