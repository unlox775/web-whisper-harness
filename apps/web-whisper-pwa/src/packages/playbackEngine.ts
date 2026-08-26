import type { PlaybackEngine, PlaybackController, Chunk } from './types'

class SimplePlaybackController implements PlaybackController {
  private audio: HTMLAudioElement
  private timeUpdateCallbacks: ((currentTime: number) => void)[] = []
  private endedCallbacks: (() => void)[] = []
  private timeUpdateInterval: number | null = null

  constructor(blob: Blob) {
    this.audio = new Audio(URL.createObjectURL(blob))
    
    this.audio.addEventListener('ended', () => {
      this.endedCallbacks.forEach(cb => cb())
    })
    
    this.audio.addEventListener('timeupdate', () => {
      this.timeUpdateCallbacks.forEach(cb => cb(this.audio.currentTime))
    })
  }

  play(): void {
    this.audio.play()
    
    // Fallback time update if native timeupdate doesn't fire frequently enough
    if (!this.timeUpdateInterval) {
      this.timeUpdateInterval = window.setInterval(() => {
        this.timeUpdateCallbacks.forEach(cb => cb(this.audio.currentTime))
      }, 100)
    }
  }

  pause(): void {
    this.audio.pause()
    if (this.timeUpdateInterval) {
      clearInterval(this.timeUpdateInterval)
      this.timeUpdateInterval = null
    }
  }

  seek(position: number): void {
    this.audio.currentTime = position
  }

  onTimeUpdate(callback: (currentTime: number) => void): void {
    this.timeUpdateCallbacks.push(callback)
  }

  onEnded(callback: () => void): void {
    this.endedCallbacks.push(callback)
  }

  getCurrentTime(): number {
    return this.audio.currentTime
  }

  getDuration(): number {
    return this.audio.duration || 0
  }

  destroy(): void {
    this.pause()
    if (this.timeUpdateInterval) {
      clearInterval(this.timeUpdateInterval)
    }
    URL.revokeObjectURL(this.audio.src)
  }
}

export const playbackEngine: PlaybackEngine = {
  playSession(_sessionId: string, chunks: Chunk[]): PlaybackController {
    // Concatenate all chunks into one blob
    const blobs = chunks.map(c => c.blob)
    const concatenated = new Blob(blobs, { type: chunks[0]?.blob.type || 'audio/webm' })
    return new SimplePlaybackController(concatenated)
  },

  playChunk(chunkBlob: Blob): PlaybackController {
    return new SimplePlaybackController(chunkBlob)
  },

  playSnip(chunks: Chunk[], startTime: number, endTime: number): PlaybackController {
    // For simplicity, play all chunks in the snip range
    // In production, would slice the audio precisely
    const snipChunks = chunks.filter(c => 
      c.startTime >= startTime && c.startTime < endTime
    )
    const blobs = snipChunks.map(c => c.blob)
    const concatenated = new Blob(blobs, { type: chunks[0]?.blob.type || 'audio/webm' })
    return new SimplePlaybackController(concatenated)
  },
}
