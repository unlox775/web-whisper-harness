import { EventEmitter } from './event-emitter.js';
import type { PlaybackHandle, PlaybackState } from './types.js';

export class PlaybackHandleImpl extends EventEmitter implements PlaybackHandle {
  private audio: HTMLAudioElement;
  private blobUrl: string;
  private _state: PlaybackState = 'idle';
  private _currentTime: number = 0;
  private _duration: number = 0;
  private released: boolean = false;

  constructor(blob: Blob) {
    super();
    
    // Create HTML5 audio element
    this.audio = new Audio();
    this.blobUrl = URL.createObjectURL(blob);
    this.audio.src = this.blobUrl;

    // Attach event listeners
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.audio.addEventListener('loadedmetadata', () => {
      this._duration = this.audio.duration;
    });

    this.audio.addEventListener('play', () => {
      this._state = 'playing';
      this.emit('playing', {
        currentTime: this.audio.currentTime,
        duration: this.audio.duration,
      });
    });

    this.audio.addEventListener('pause', () => {
      if (this._state === 'playing') {
        this._state = 'paused';
        this.emit('paused', {
          currentTime: this.audio.currentTime,
        });
      }
    });

    this.audio.addEventListener('timeupdate', () => {
      this._currentTime = this.audio.currentTime;
      this.emit('timeupdate', {
        currentTime: this.audio.currentTime,
      });
    });

    this.audio.addEventListener('seeked', () => {
      this.emit('seeked', {
        currentTime: this.audio.currentTime,
      });
    });

    this.audio.addEventListener('ended', () => {
      this._state = 'stopped';
      this._currentTime = 0;
      this.emit('ended', {});
      this.release();
    });

    this.audio.addEventListener('error', (e) => {
      this.emit('playbackError', {
        reason: 'audio_decode_failed',
        detail: e,
      });
      this.release();
    });
  }

  get state(): PlaybackState {
    return this._state;
  }

  get currentTime(): number {
    return this._currentTime;
  }

  get duration(): number {
    return this._duration;
  }

  async start(): Promise<void> {
    try {
      await this.audio.play();
      this._state = 'playing';
    } catch (error) {
      this.emit('playbackError', {
        reason: 'audio_play_failed',
        detail: error,
      });
      throw error;
    }
  }

  pause(): void {
    if (this.released || this._state !== 'playing') return;
    this.audio.pause();
  }

  resume(): void {
    if (this.released || this._state !== 'paused') return;
    this.audio.play().catch(error => {
      this.emit('playbackError', {
        reason: 'audio_play_failed',
        detail: error,
      });
    });
  }

  seek(time: number): void {
    if (this.released) return;
    
    // Clamp time to valid range
    const clampedTime = Math.max(0, Math.min(time, this._duration || 0));
    this.audio.currentTime = clampedTime;
  }

  stop(): void {
    if (this.released) return;
    
    this.audio.pause();
    this.audio.currentTime = 0;
    this._state = 'stopped';
    this._currentTime = 0;
    this.emit('stopped', {});
    this.release();
  }

  private release(): void {
    if (this.released) return;
    
    this.released = true;
    URL.revokeObjectURL(this.blobUrl);
    this.removeAllListeners();
  }
}
