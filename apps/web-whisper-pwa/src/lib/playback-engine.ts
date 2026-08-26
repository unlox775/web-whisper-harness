// Stub implementation of playback-engine package
// Based on packages/lib/playback-engine/customers/web-whisper-pwa.md

import { sessionStore } from './session-store'

type EventCallback = (data: any) => void

export class PlaybackHandle {
  private audio: HTMLAudioElement | null = null
  private events: Map<string, EventCallback[]> = new Map()
  private _state: 'playing' | 'paused' | 'stopped' = 'stopped'
  private updateInterval: number | null = null

  get state() {
    return this._state
  }

  get currentTime() {
    return this.audio?.currentTime ?? 0
  }

  get duration() {
    return this.audio?.duration ?? 0
  }

  async init(audioBlob: Blob): Promise<void> {
    this.audio = new Audio()
    this.audio.src = URL.createObjectURL(audioBlob)
    
    this.audio.addEventListener('play', () => {
      this._state = 'playing'
      this.startTimeUpdates()
      this.emit('playing', { currentTime: this.currentTime, duration: this.duration })
    })
    
    this.audio.addEventListener('pause', () => {
      this._state = 'paused'
      this.stopTimeUpdates()
      this.emit('paused', { currentTime: this.currentTime })
    })
    
    this.audio.addEventListener('ended', () => {
      this._state = 'stopped'
      this.stopTimeUpdates()
      this.emit('ended', {})
      this.cleanup()
    })
    
    this.audio.addEventListener('error', () => {
      this.emit('playbackError', {
        reason: 'audio_decode_failed',
        detail: this.audio?.error
      })
      this.cleanup()
    })
    
    await this.audio.play()
  }

  private startTimeUpdates(): void {
    this.updateInterval = window.setInterval(() => {
      if (this.audio && this._state === 'playing') {
        this.emit('timeupdate', { currentTime: this.currentTime })
      }
    }, 250)
  }

  private stopTimeUpdates(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval)
      this.updateInterval = null
    }
  }

  pause(): void {
    if (this.audio && this._state === 'playing') {
      this.audio.pause()
    }
  }

  resume(): void {
    if (this.audio && this._state === 'paused') {
      this.audio.play()
    }
  }

  seek(time: number): void {
    if (this.audio) {
      const clampedTime = Math.max(0, Math.min(time, this.duration))
      this.audio.currentTime = clampedTime
      this.emit('seeked', { currentTime: clampedTime })
    }
  }

  stop(): void {
    if (this.audio) {
      this.audio.pause()
      this.audio.currentTime = 0
      this._state = 'stopped'
      this.emit('stopped', {})
      this.cleanup()
    }
  }

  private cleanup(): void {
    this.stopTimeUpdates()
    if (this.audio) {
      URL.revokeObjectURL(this.audio.src)
      this.audio = null
    }
  }

  on(event: string, callback: EventCallback): void {
    if (!this.events.has(event)) {
      this.events.set(event, [])
    }
    this.events.get(event)!.push(callback)
  }

  off(event: string, callback: EventCallback): void {
    const callbacks = this.events.get(event)
    if (callbacks) {
      const index = callbacks.indexOf(callback)
      if (index !== -1) {
        callbacks.splice(index, 1)
      }
    }
  }

  private emit(event: string, data: any): void {
    const callbacks = this.events.get(event)
    if (callbacks) {
      callbacks.forEach(cb => cb(data))
    }
  }
}

export const playbackEngine = {
  async playSession(sessionId: string): Promise<PlaybackHandle | { error: string; sessionId?: string }> {
    const session = await sessionStore.getSession(sessionId)
    if (!session || 'error' in session) {
      return { error: 'session_not_found', sessionId }
    }
    
    const chunksResult = await sessionStore.getChunksForSession(sessionId)
    if ('error' in chunksResult) {
      return { error: 'chunks_missing', sessionId }
    }
    
    if (chunksResult.chunks.length === 0) {
      return { error: 'chunks_missing', sessionId }
    }
    
    const chunkBlobs: Blob[] = []
    for (const chunk of chunksResult.chunks) {
      const fullChunk = await sessionStore.getChunk(chunk.id)
      if (fullChunk?.blob) {
        chunkBlobs.push(fullChunk.blob)
      }
    }
    
    const concatenatedBlob = new Blob(chunkBlobs, { type: 'audio/mpeg' })
    const handle = new PlaybackHandle()
    await handle.init(concatenatedBlob)
    return handle
  },

  async playChunk(chunkId: string): Promise<PlaybackHandle | { error: string; chunkId?: string }> {
    const chunk = await sessionStore.getChunk(chunkId)
    if (!chunk || !chunk.blob) {
      return { error: 'chunk_not_found', chunkId }
    }
    
    const handle = new PlaybackHandle()
    await handle.init(chunk.blob)
    return handle
  }
}
