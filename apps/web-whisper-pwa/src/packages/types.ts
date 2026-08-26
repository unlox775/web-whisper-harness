// Package stub interfaces - these will be replaced with real package imports when packages are implemented

// ===== session-store types and interface =====
export interface Session {
  sessionId: string
  timestamp: number
  duration: number
  status: 'active' | 'completed' | 'no-audio'
  chunkCount: number
  hasAudio: boolean
}

export interface Chunk {
  chunkId: string
  sessionId: string
  startTime: number
  duration: number
  byteSize: number
  blob: Blob
}

export interface VolumeProfile {
  chunkId: string
  sessionId: string
  volumeSamples: Float32Array
  maxVolume: number
  avgVolume: number
}

export interface Snip {
  snipId: string
  sessionId: string
  startTime: number
  endTime: number
  duration: number
  chunkRefs: string[]
  confidence: number
}

export interface Transcript {
  transcriptId: string
  sessionId: string
  snipId: string
  text: string
  timestamp: number
}

export interface SessionStore {
  createSession(): Promise<{ sessionId: string }>
  getSession(sessionId: string): Promise<Session | null>
  listSessions(): Promise<Session[]>
  deleteSession(sessionId: string): Promise<void>
  getChunksForSession(sessionId: string): Promise<Chunk[]>
  writeChunk(sessionId: string, chunkData: Omit<Chunk, 'chunkId' | 'sessionId'>): Promise<{ chunkId: string }>
  writeVolumeProfile(sessionId: string, chunkId: string, volumeSamples: Float32Array): Promise<void>
  getVolumeProfiles(sessionId: string): Promise<VolumeProfile[]>
  writeSnip(sessionId: string, snipData: Omit<Snip, 'snipId' | 'sessionId'>): Promise<{ snipId: string }>
  getSnips(sessionId: string): Promise<Snip[]>
  writeTranscript(sessionId: string, snipId: string, text: string): Promise<void>
  getTranscripts(sessionId: string): Promise<Transcript[]>
  enforceRetentionPolicy(capMB: number): Promise<{ deletedSessions: string[] }>
  getStorageUsage(): Promise<{ usedBytes: number; capBytes: number }>
  clearAll(): Promise<void>
}

// ===== capture-engine types and interface =====
export interface CaptureHandle {
  stop(): Promise<CompletionSummary>
}

export interface CompletionSummary {
  chunksWritten: number
  totalDuration: number
  hasAudio: boolean
}

export interface CaptureEngine {
  startCapture(sessionId: string, onChunkEncoded?: (chunkId: string) => void): Promise<CaptureHandle>
}

// ===== volume-analyzer types and interface =====
export interface VolumeAnalysisResult {
  chunkId: string
  volumeSamples: Float32Array
  maxVolume: number
  avgVolume: number
}

export interface SnipProposal {
  startTime: number
  endTime: number
  chunkRefs: string[]
  confidence: number
}

export interface VolumeAnalyzer {
  analyzeChunk(chunkBlob: Blob): Promise<VolumeAnalysisResult>
  proposeSnips(sessionId: string, volumeProfiles: VolumeProfile[]): Promise<SnipProposal[]>
}

// ===== transcription-client types and interface =====
export interface TranscriptionClient {
  validateKey(apiKey: string): Promise<{ valid: boolean; message?: string }>
  transcribeAudio(audioBlob: Blob, apiKey: string): Promise<{ text: string }>
}

// ===== playback-engine types and interface =====
export interface PlaybackController {
  play(): void
  pause(): void
  seek(position: number): void
  onTimeUpdate(callback: (currentTime: number) => void): void
  onEnded(callback: () => void): void
  getCurrentTime(): number
  getDuration(): number
  destroy(): void
}

export interface PlaybackEngine {
  playSession(sessionId: string, chunks: Chunk[]): PlaybackController
  playChunk(chunkBlob: Blob): PlaybackController
  playSnip(chunks: Chunk[], startTime: number, endTime: number): PlaybackController
}
