import { EventEmitter } from './event-emitter.js';
import {
  applyPlaybackVolume,
  DEFAULT_PLAYBACK_VOLUME,
  getAudioContextConstructor,
} from './playback-volume.js';
import type { PlaybackHandle, PlaybackState } from './types.js';

export class PlaybackHandleImpl extends EventEmitter implements PlaybackHandle {
  private audio: HTMLAudioElement;
  private blobUrl: string;
  private _state: PlaybackState = 'idle';
  private _currentTime: number = 0;
  private _duration: number = 0;
  private released: boolean = false;
  private volume: number = DEFAULT_PLAYBACK_VOLUME;
  private audioContext: AudioContext | null = null;
  private mediaSource: MediaElementAudioSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private graphReady: boolean = false;

  constructor(blob: Blob) {
    super();

    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.audio.setAttribute('playsinline', 'true');
    this.audio.setAttribute('webkit-playsinline', 'true');
    (this.audio as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
    this.blobUrl = URL.createObjectURL(blob);
    this.audio.src = this.blobUrl;
    this.attachAudioElement();
    this.ensureVolumeGraph();
    this.applyVolume();
    this.setupEventListeners();
  }

  private attachAudioElement(): void {
    if (typeof document === 'undefined' || !document.body) return;
    if (this.audio.isConnected) return;
    this.audio.setAttribute('aria-hidden', 'true');
    this.audio.style.position = 'absolute';
    this.audio.style.width = '0';
    this.audio.style.height = '0';
    this.audio.style.opacity = '0';
    this.audio.style.pointerEvents = 'none';
    document.body.appendChild(this.audio);
  }

  /**
   * HTMLAudioElement → MediaElementSource → GainNode → destination.
   * Create the MediaElementSource once; a second call throws.
   */
  private ensureVolumeGraph(): void {
    if (this.graphReady || this.released) return;

    const AudioContextCtor = getAudioContextConstructor();
    if (!AudioContextCtor) {
      return;
    }

    try {
      this.audioContext = new AudioContextCtor();
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = this.volume;
      this.mediaSource = this.audioContext.createMediaElementSource(this.audio);
      this.mediaSource.connect(this.gainNode);
      this.gainNode.connect(this.audioContext.destination);
      this.graphReady = true;
    } catch {
      this.teardownVolumeGraph();
    }
  }

  private applyVolume(): void {
    this.volume = applyPlaybackVolume(this.volume, {
      gain: this.gainNode?.gain ?? null,
      element: this.audio,
      graphReady: this.graphReady,
    });
    this.audio.dataset.playbackVolume = String(this.volume);
    this.audio.dataset.volumePath = this.graphReady ? 'gain-node' : 'element-volume';
  }

  private async resumeAudioContext(): Promise<void> {
    this.ensureVolumeGraph();
    if (!this.audioContext) return;
    if (this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
      } catch {
        // iOS may reject resume outside a gesture; play() is the next chance.
      }
    }
  }

  private teardownVolumeGraph(): void {
    try {
      this.mediaSource?.disconnect();
    } catch {
      // already disconnected
    }
    try {
      this.gainNode?.disconnect();
    } catch {
      // already disconnected
    }
    if (this.audioContext) {
      void this.audioContext.close().catch(() => undefined);
    }
    this.mediaSource = null;
    this.gainNode = null;
    this.audioContext = null;
    this.graphReady = false;
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
      await this.resumeAudioContext();
      this.applyVolume();
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
    void this.resumeAudioContext()
      .then(() => {
        this.applyVolume();
        return this.audio.play();
      })
      .catch((error) => {
        this.emit('playbackError', {
          reason: 'audio_play_failed',
          detail: error,
        });
      });
  }

  seek(time: number): void {
    if (this.released) return;

    const clampedTime = Math.max(0, Math.min(time, this._duration || 0));
    this.audio.currentTime = clampedTime;
  }

  setVolume(level: number): void {
    if (this.released) return;
    this.ensureVolumeGraph();
    this.volume = applyPlaybackVolume(level, {
      gain: this.gainNode?.gain ?? null,
      element: this.audio,
      graphReady: this.graphReady,
    });
    this.audio.dataset.playbackVolume = String(this.volume);
    this.audio.dataset.volumePath = this.graphReady ? 'gain-node' : 'element-volume';
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
    this.teardownVolumeGraph();
    if (this.audio.parentNode) {
      this.audio.parentNode.removeChild(this.audio);
    }
    URL.revokeObjectURL(this.blobUrl);
    this.removeAllListeners();
  }
}
