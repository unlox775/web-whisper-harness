// Microphone-to-durable-chunk pipeline
// Acquires mic, captures PCM, encodes MP3 chunks every ~4s, writes immediately to session-store

import { writeChunk, getSession } from '@web-whisper/session-store'

export interface CaptureHandle {
  stop(): Promise<{
    chunksWritten: number
    totalDuration: number
    hasAudio: boolean
  }>
}

class SimpleCaptureHandle implements CaptureHandle {
  private sessionId: string
  private mediaRecorder: MediaRecorder | null = null
  private startTime: number
  private chunkCount = 0
  private stopped = false
  private onChunkCallback?: (chunkId: string) => void

  constructor(sessionId: string, onChunkEncoded?: (chunkId: string) => void) {
    this.sessionId = sessionId
    this.onChunkCallback = onChunkEncoded
    this.startTime = Date.now()
  }

  async start(stream: MediaStream): Promise<boolean> {
    try {
      // Use MediaRecorder to capture audio in chunks
      // Note: This produces WebM/Opus, not MP3. Real implementation would use lamejs for MP3 encoding.
      const options = { mimeType: 'audio/webm;codecs=opus' }
      this.mediaRecorder = new MediaRecorder(stream, options)
      
      this.mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0 && !this.stopped) {
          // Write chunk to session-store
          const chunkDuration = 4.0 // Approximate 4 seconds per chunk
          const startTime = this.chunkCount * chunkDuration
          const { chunkId } = await writeChunk(this.sessionId, {
            seq: this.chunkCount,
            startTime,
            duration: chunkDuration,
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

  async stop(): Promise<{
    chunksWritten: number
    totalDuration: number
    hasAudio: boolean
  }> {
    this.stopped = true
    
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      return new Promise((resolve) => {
        this.mediaRecorder!.onstop = async () => {
          const totalDuration = (Date.now() - this.startTime) / 1000
          
          // Update session status
          const session = await getSession(this.sessionId)
          if (session) {
            session.status = this.chunkCount > 0 ? 'completed' : 'no-audio'
            session.duration = totalDuration
          }
          
          resolve({
            chunksWritten: this.chunkCount,
            totalDuration,
            hasAudio: this.chunkCount > 0,
          })
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

export async function startCapture(
  sessionId: string,
  onChunkEncoded?: (chunkId: string) => void
): Promise<CaptureHandle> {
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
      const session = await getSession(sessionId)
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
}
