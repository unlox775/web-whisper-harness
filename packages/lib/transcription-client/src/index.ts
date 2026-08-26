// Groq Whisper API client

export interface ValidationResult {
  valid: boolean
  reason?: string
}

export interface TranscriptionResult {
  text: string
  language?: string
  error?: string
}

export async function validateKey(apiKey: string): Promise<ValidationResult> {
  if (!apiKey || apiKey.trim() === '') {
    return { valid: false, reason: 'API key is required' }
  }
  
  // Simple format validation
  if (!apiKey.startsWith('gsk_')) {
    return { valid: false, reason: 'Invalid API key format. Groq keys start with "gsk_"' }
  }
  
  // In production, would make actual API call to test endpoint
  return { valid: true }
}

export async function transcribeAudio(audioBlob: Blob, apiKey: string): Promise<TranscriptionResult> {
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
      language: 'en',
    }
  } catch (error) {
    console.error('Transcription failed:', error)
    return {
      text: '',
      error: String(error),
    }
  }
}
