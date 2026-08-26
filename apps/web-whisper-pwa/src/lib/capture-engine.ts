// Stub implementation of capture-engine package
// Based on packages/lib/capture-engine/customers/web-whisper-pwa.md

import { sessionStore } from './session-store'

type EventCallback = (data: any) => void

export class CaptureHandle {
  private audioContext: AudioContext | null = null
  private mediaStream: MediaStream | null = null
  private isActive = false
  private chunksEncoded = 0
  private currentDuration = 0
  private startTime = 0
  private sessionId: string
  private chunkInterval: number | null = null
  private watchdogTimeout: number | null = null
  private audioReceived = false
  private events: Map<string, EventCallback[]> = new Map()

  constructor(sessionId: string, private options: { watchdogTimeout?: number } = {}) {
    this.sessionId = sessionId
  }

  async start(): Promise<void> {
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      this.audioContext = new AudioContext({ sampleRate: 48000 })
      this.isActive = true
      this.startTime = Date.now()
      
      this.startWatchdog()
      this.startChunkSimulation()
      
      this.emit('captureStarted', { sessionId: this.sessionId })
    } catch (error) {
      if ((error as any).name === 'NotAllowedError') {
        throw new Error('permission_denied')
      }
      throw error
    }
  }

  private startWatchdog(): void {
    const timeout = this.options.watchdogTimeout ?? 10000
    this.watchdogTimeout = window.setTimeout(() => {
      if (!this.audioReceived && this.isActive) {
        this.emit('captureError', {
          sessionId: this.sessionId,
          reason: 'no_audio_received',
          details: 'Microphone did not deliver audio within watchdog period'
        })
        this.stop()
      }
    }, timeout)
  }

  private startChunkSimulation(): void {
    this.chunkInterval = window.setInterval(async () => {
      if (!this.isActive) return
      
      this.audioReceived = true
      const now = Date.now()
      const elapsed = (now - this.startTime) / 1000
      
      const seq = this.chunksEncoded
      const startTime = seq * 4
      const endTime = startTime + 4
      const duration = 4
      
      const silentAudio = this.generateSilentMP3()
      
      try {
        await sessionStore.writeChunk(this.sessionId, silentAudio, {
          seq,
          startTime,
          endTime
        })
        
        this.chunksEncoded++
        this.currentDuration = elapsed
        
        this.emit('chunkEncoded', {
          sessionId: this.sessionId,
          seq,
          duration,
          byteLength: silentAudio.size
        })
      } catch (error) {
        this.emit('captureError', {
          sessionId: this.sessionId,
          reason: 'store_write_failed',
          details: String(error)
        })
      }
    }, 4000)
  }

  private generateSilentMP3(): Blob {
    const base64 = 'SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tAwAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAQKAAAAAAAABcWOhCCR//tAwAABjgFP/04YABAAAAAAAAAAAAAAAAAAAAAsP/7MQZ8gAAAGkAAAAAAAABpAAAAAAA//tQxAYAAAaQAAAAAAAABpAAAAAAP/7UsQGAAAABpAAAAAAAAGkAAAAA//tSxAYAAADSAAAAAAAAANIAAAAA//tQxAYAAAAGkAAAAAAAAAAAAA/+kP/+P+jQf/+//o0P//oX//+qf///+kP///+k////+///+k//wP/1D//+P//0P///+j///8P//+j///+k////+k/+kP///+k///+k/+j///+k///+kP//+j///+kf//+k///+kf//+k////+kP///+j////+k///+kP//+j///+k///+j///+kP//+j///+kP///+k////+k///+kP///+kf//+kP//+kP//+kf//+k//wP///+k///+kf///+kP///+k////+kP///+j///+kP//+k///+kf//+k//wP///+kP///+k///+kP///+k////+kP///+j///+kf//+k///+kP//+kP//+kf//+k//8D///+j///+kP///+k////+kf//+k//8D///+j///+k///+kf//+kP///+k////+kP///+kf///+j///+k//8D///'
    const binary = atob(base64)
    const array = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      array[i] = binary.charCodeAt(i)
    }
    return new Blob([array], { type: 'audio/mpeg' })
  }

  async stop(): Promise<{ chunksWritten: number; totalDuration: number; hasAudio: boolean; sessionId: string }> {
    this.isActive = false
    
    if (this.chunkInterval) {
      clearInterval(this.chunkInterval)
      this.chunkInterval = null
    }
    
    if (this.watchdogTimeout) {
      clearTimeout(this.watchdogTimeout)
      this.watchdogTimeout = null
    }
    
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop())
      this.mediaStream = null
    }
    
    if (this.audioContext) {
      await this.audioContext.close()
      this.audioContext = null
    }
    
    const result = {
      chunksWritten: this.chunksEncoded,
      totalDuration: this.currentDuration,
      hasAudio: this.chunksEncoded > 0,
      sessionId: this.sessionId
    }
    
    this.emit('captureStopped', result)
    
    return result
  }

  getStatus() {
    return {
      isActive: this.isActive,
      chunksEncoded: this.chunksEncoded,
      currentDuration: this.currentDuration,
      watchdogActive: this.watchdogTimeout !== null
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

export const captureEngine = {
  async startCapture(sessionId: string, options?: { watchdogTimeout?: number }): Promise<CaptureHandle> {
    const handle = new CaptureHandle(sessionId, options)
    await handle.start()
    return handle
  }
}
