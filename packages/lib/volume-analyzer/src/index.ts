// Analyzes recorded audio chunks to compute volume profiles and propose snip boundaries

import { getChunksForSession, writeVolumeProfile, getVolumeProfile, writeSnip } from '@web-whisper/session-store'

export interface VolumeAnalysisResult {
  success: boolean
  profileSummary?: {
    chunkCount: number
    avgVolume: number
    maxVolume: number
    sampleCount: number
  }
  error?: string
}

export interface SnipProposalResult {
  success: boolean
  snips?: Array<{
    snipId?: string
    startTime: number
    endTime: number
    startChunkIndex: number
    endChunkIndex: number
    confidence: number
  }>
  error?: string
}

export async function analyzeVolume(sessionId: string): Promise<VolumeAnalysisResult> {
  try {
    const chunks = await getChunksForSession(sessionId)
    if (chunks.length === 0) {
      return { success: false, error: 'No chunks for session' }
    }

    // Simplified: generate synthetic volume data
    // Real implementation would decode MP3 to PCM and compute actual volume
    const chunkVolumes = chunks.map((chunk, index) => {
      const samples = new Float32Array(40) // 100ms intervals over ~4s chunk
      for (let i = 0; i < samples.length; i++) {
        samples[i] = 0.3 + Math.random() * 0.4
      }
      const avgDb = -20 + Math.random() * 10
      const peakDb = -10 + Math.random() * 5
      return {
        chunkId: chunk.chunkId,
        chunkIndex: index,
        avgDb,
        peakDb,
        samples,
      }
    })

    await writeVolumeProfile(sessionId, { chunkVolumes })

    const totalSamples = chunkVolumes.reduce((sum, cv) => sum + cv.samples.length, 0)
    const avgVolume = chunkVolumes.reduce((sum, cv) => sum + cv.avgDb, 0) / chunkVolumes.length
    const maxVolume = Math.max(...chunkVolumes.map(cv => cv.peakDb))

    return {
      success: true,
      profileSummary: {
        chunkCount: chunks.length,
        avgVolume,
        maxVolume,
        sampleCount: totalSamples,
      },
    }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

export async function proposeSnips(
  sessionId: string,
  options?: {
    quietThreshold?: number
    minSnipDuration?: number
    maxSnipDuration?: number
  }
): Promise<SnipProposalResult> {
  try {
    // Ensure volume profile exists
    let profile = await getVolumeProfile(sessionId)
    if (!profile) {
      const result = await analyzeVolume(sessionId)
      if (!result.success) {
        return { success: false, error: result.error }
      }
      profile = await getVolumeProfile(sessionId)
    }

    if (!profile) {
      return { success: false, error: 'Volume profile missing' }
    }

    const quietThreshold = options?.quietThreshold ?? 0.3
    const minSnipDuration = options?.minSnipDuration ?? 5
    const maxSnipDuration = options?.maxSnipDuration ?? 60

    // Simplified snip proposal: create one snip per 1-2 chunks
    const snips: Array<{
      startTime: number
      endTime: number
      startChunkIndex: number
      endChunkIndex: number
      confidence: number
    }> = []

    for (let i = 0; i < profile.chunkVolumes.length; i += 2) {
      const start = profile.chunkVolumes[i]
      const end = profile.chunkVolumes[Math.min(i + 1, profile.chunkVolumes.length - 1)]
      
      snips.push({
        startTime: start.chunkIndex * 4,
        endTime: (end.chunkIndex + 1) * 4,
        startChunkIndex: start.chunkIndex,
        endChunkIndex: end.chunkIndex,
        confidence: 0.8,
      })
    }

    // Write snips to session-store
    for (const snip of snips) {
      const { snipId } = await writeSnip(sessionId, {
        ...snip,
        chunkRefs: profile.chunkVolumes
          .slice(snip.startChunkIndex, snip.endChunkIndex + 1)
          .map(cv => cv.chunkId),
      })
      snip.snipId = snipId
    }

    return { success: true, snips }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}
