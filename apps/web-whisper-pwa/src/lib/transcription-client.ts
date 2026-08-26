// Stub implementation of transcription-client package
// Based on packages/lib/transcription-client/customers/web-whisper-pwa.md

export const transcriptionClient = {
  async validateKey(apiKey: string): Promise<{ valid: boolean; reason?: string }> {
    if (!apiKey || !apiKey.startsWith('gsk_')) {
      return { valid: false, reason: 'Key format incorrect' }
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    return { valid: false, reason: 'Groq service unavailable (stub implementation)' }
  },

  async transcribeAudio(_audioBlob: Blob, _apiKey: string): Promise<{ text: string; language?: string } | { error: string }> {
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    return {
      error: 'Groq service unavailable (stub implementation)'
    }
  }
}
