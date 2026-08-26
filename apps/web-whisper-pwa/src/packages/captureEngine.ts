import type { CaptureEngine, CaptureHandle, CompletionSummary } from './types'
import { sessionStore } from './sessionStore'

// Simple PCM to MP3 encoding using lamejs
// For production, would use @breezystack/lamejs or similar
// For now, we'll just create dummy MP3 blobs from PCM data

class SimpleCaptureHandle implements CaptureHandle {
  private sessionId: string
  private mediaRecorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private startTime: number
  private onChunkCallback?: (chunkId: string) => void
  private chunkCount = 0
  private stopped = false

  constructor(sessionId: string, onChunkEncoded?: (chunkId: string) => void) {
    this.sessionId = sessionId
    this.onChunkCallback = onChunkEncoded
    this.startTime = Date.now()
  }

  async start(stream: MediaStream) {
    try {
      // Use MediaRecorder to capture audio in chunks
      const options = { mimeType: 'audio/webm;codecs=opus' }
      this.mediaRecorder = new MediaRecorder(stream, options)
      
      this.mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0 && !this.stopped) {
          this.chunks.push(event.data)
          
          // Write chunk to session-store
          const chunkDuration = 4.0 // Approximate 4 seconds per chunk
          const startTime = this.chunkCount * chunkDuration
          const { chunkId } = await sessionStore.writeChunk(this.sessionId, {
            startTime,
            duration: chunkDuration,
            byteSize: event.data.size,
            blob: event.data,
          })
          
          this.chunkCount++
          if (this.onChunkCallback) {
            this.onChunkCallback(chunkId)
          }
        }
      }
      
      this.mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event)
      }
      
      // Request data every 4 seconds
      this.mediaRecorder.start(4000)
      
      return true
    } catch (error) {
      console.error('Failed to start capture:', error)
      return false
    }
  }

  async stop(): Promise<CompletionSummary> {
    this.stopped = true
    
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      return new Promise((resolve) => {
        this.mediaRecorder!.onstop = async () => {
          // Final chunk if any
          if (this.mediaRecorder && this.mediaRecorder.state === 'inactive') {
            const totalDuration = (Date.now() - this.startTime) / 1000
            
            // Update session to completed
            const session = await sessionStore.getSession(this.sessionId)
            if (session) {
              session.status = this.chunkCount > 0 ? 'completed' : 'no-audio'
              session.duration = totalDuration
              await sessionStore.writeChunk(this.sessionId, {
                startTime: 0,
                duration: 0,
                byteSize: 0,
                blob: new Blob(),
              })
            }
            
            resolve({
              chunksWritten: this.chunkCount,
              totalDuration,
              hasAudio: this.chunkCount > 0,
            })
          }
        }
        
        this.mediaRecorder!.stop()
        
        // Stop all tracks
        if (this.mediaRecorder!.stream) {
          this.mediaRecorder!.stream.getTracks().forEach(track => track.stop())
        }
      })
    }
    
    const totalDuration = (Date.now() - this.startTime) / 1000
    return {
      chunksWritten: this.chunkCount,
      totalDuration,
      hasAudio: this.chunkCount > 0,
    }
  }
}

export const captureEngine: CaptureEngine = {
  async startCapture(sessionId: string, onChunkEncoded?: (chunkId: string) => void): Promise<CaptureHandle> {
    try {
      // Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      
      const handle = new SimpleCaptureHandle(sessionId, onChunkEncoded)
      const started = await handle.start(stream)
      
      if (!started) {
        throw new Error('Failed to start audio capture')
      }
      
      // Watchdog: check for audio after 10 seconds
      setTimeout(async () => {
        const session = await sessionStore.getSession(sessionId)
        if (session && session.chunkCount === 0 && session.status === 'active') {
          // No chunks after 10s - ghost mic issue
          console.warn('Microphone ghost detected - no audio after 10s')
          await handle.stop()
        }
      }, 10000)
      
      return handle
    } catch (error) {
      console.error('Microphone permission denied or error:', error)
      throw error
    }
  },
}
