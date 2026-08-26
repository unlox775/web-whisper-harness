import type { TranscriptionClient } from './types'

export const transcriptionClient: TranscriptionClient = {
  async validateKey(apiKey: string): Promise<{ valid: boolean; message?: string }> {
    if (!apiKey || apiKey.trim() === '') {
      return { valid: false, message: 'API key is required' }
    }
    
    // Simple validation: check format
    if (!apiKey.startsWith('gsk_')) {
      return { valid: false, message: 'Invalid API key format. Groq keys start with "gsk_"' }
    }
    
    // In production, would make actual API call to validate
    // For now, accept any key starting with "gsk_"
    return { valid: true }
  },

  async transcribeAudio(_audioBlob: Blob, _apiKey: string): Promise<{ text: string }> {
    // In production, would call Groq Whisper API
    // For now, return placeholder text
    
    try {
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000))
      
      // Check if we should simulate a failure (10% chance)
      if (Math.random() < 0.1) {
        throw new Error('Transcription service temporarily unavailable')
      }
      
      // Return synthetic transcription
      const sampleTexts = [
        'This is a sample transcription of the recorded audio.',
        'The audio has been successfully transcribed using Whisper.',
        'Here is the transcribed text from this audio segment.',
        'Audio transcription completed. This is the resulting text.',
        'This segment contains spoken words that have been converted to text.',
      ]
      
      return {
        text: sampleTexts[Math.floor(Math.random() * sampleTexts.length)],
      }
    } catch (error) {
      console.error('Transcription failed:', error)
      throw error
    }
  },
}
