// Audio playback for sessions, chunks, and snips

import { getChunksForSession, getChunk, getSnip } from '@web-whisper/session-store'

export interface PlaybackHandle {
  play(): void
  pause(): void
  seek(position: number): void
  onTimeUpdate(callback: (currentTime: number) => void): void
  onEnded(callback: () => void): void
  getCurrentTime(): number
  getDuration(): number
  destroy(): void
}

class SimplePlaybackHandle implements PlaybackHandle {
  private audio: HTMLAudioElement
  private timeUpdateCallbacks: Array<(currentTime: number) => void> = []
  private endedCallbacks: Array<() => void> = []
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

export async function playSession(sessionId: string): Promise<PlaybackHandle> {
  const chunks = await getChunksForSession(sessionId)
  const blobs = chunks.map(c => c.blob)
  const concatenated = new Blob(blobs, { type: chunks[0]?.blob.type || 'audio/webm' })
  return new SimplePlaybackHandle(concatenated)
}

export async function playChunk(chunkId: string): Promise<PlaybackHandle> {
  const chunk = await getChunk(chunkId)
  if (!chunk) throw new Error('Chunk not found')
  return new SimplePlaybackHandle(chunk.blob)
}

export async function playSnip(snipId: string): Promise<PlaybackHandle> {
  const snip = await getSnip(snipId)
  if (!snip) throw new Error('Snip not found')
  
  // Get chunks for snip
  const chunks = await Promise.all(snip.chunkRefs.map(id => getChunk(id)))
  const validChunks = chunks.filter(c => c !== null)
  const blobs = validChunks.map(c => c!.blob)
  const concatenated = new Blob(blobs, { type: validChunks[0]?.blob.type || 'audio/webm' })
  return new SimplePlaybackHandle(concatenated)
}
