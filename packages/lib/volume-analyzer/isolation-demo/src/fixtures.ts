/**
 * Fixture Audio Generator
 * 
 * Generate synthetic MP3 audio chunks with known volume patterns for testing.
 */

export interface FixturePattern {
  id: string;
  name: string;
  description: string;
  chunks: Array<{
    duration: number; // seconds
    loudness: 'quiet' | 'loud'; // Target loudness level
  }>;
}

export const FIXTURE_PATTERNS: FixturePattern[] = [
  {
    id: 'quiet-loud-quiet',
    name: 'Quiet → Loud → Quiet',
    description: '15s total: 3s quiet, 9s loud, 3s quiet',
    chunks: [
      { duration: 3, loudness: 'quiet' },
      { duration: 9, loudness: 'loud' },
      { duration: 3, loudness: 'quiet' },
    ],
  },
  {
    id: 'all-quiet',
    name: 'All Quiet',
    description: '10s of near-silence',
    chunks: [
      { duration: 10, loudness: 'quiet' },
    ],
  },
  {
    id: 'all-loud',
    name: 'All Loud',
    description: '10s of continuous speech',
    chunks: [
      { duration: 10, loudness: 'loud' },
    ],
  },
  {
    id: 'loud-quiet-loud',
    name: 'Loud → Quiet → Loud',
    description: '12s total: 4s loud, 4s quiet, 4s loud',
    chunks: [
      { duration: 4, loudness: 'loud' },
      { duration: 4, loudness: 'quiet' },
      { duration: 4, loudness: 'loud' },
    ],
  },
  {
    id: 'short-speech',
    name: 'Short Speech',
    description: '3s loud (< 5s min duration)',
    chunks: [
      { duration: 3, loudness: 'loud' },
    ],
  },
];

/**
 * Generate synthetic audio chunk as MP3 blob
 */
export async function generateFixtureChunk(
  duration: number,
  loudness: 'quiet' | 'loud'
): Promise<Blob> {
  const sampleRate = 48000;
  const audioContext = new OfflineAudioContext(1, sampleRate * duration, sampleRate);
  
  // Create oscillator with appropriate gain
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  
  oscillator.frequency.value = 440; // A4 note
  oscillator.type = 'sine';
  
  // Set gain based on loudness level
  // quiet ~= -55dB, loud ~= -15dB
  const gain = loudness === 'quiet' ? 0.002 : 0.2;
  gainNode.gain.value = gain;
  
  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  
  oscillator.start(0);
  oscillator.stop(duration);
  
  const audioBuffer = await audioContext.startRendering();
  
  // Convert to WAV (simplified MP3 substitute for demo purposes)
  const wavBlob = audioBufferToWav(audioBuffer);
  return wavBlob;
}

/**
 * Convert AudioBuffer to WAV blob (simplified for demo)
 */
function audioBufferToWav(audioBuffer: AudioBuffer): Blob {
  const length = audioBuffer.length * audioBuffer.numberOfChannels * 2;
  const buffer = new ArrayBuffer(44 + length);
  const view = new DataView(buffer);
  const channels = [];
  let offset = 0;
  let pos = 0;

  // Write WAV header
  const setUint16 = (data: number) => {
    view.setUint16(pos, data, true);
    pos += 2;
  };
  const setUint32 = (data: number) => {
    view.setUint32(pos, data, true);
    pos += 4;
  };

  setUint32(0x46464952); // "RIFF"
  setUint32(36 + length); // file length - 8
  setUint32(0x45564157); // "WAVE"
  setUint32(0x20746d66); // "fmt " chunk
  setUint32(16); // length = 16
  setUint16(1); // PCM (uncompressed)
  setUint16(audioBuffer.numberOfChannels);
  setUint32(audioBuffer.sampleRate);
  setUint32(audioBuffer.sampleRate * 2 * audioBuffer.numberOfChannels); // avg. bytes/sec
  setUint16(audioBuffer.numberOfChannels * 2); // block-align
  setUint16(16); // 16-bit
  setUint32(0x61746164); // "data" chunk
  setUint32(length);

  // Write interleaved PCM samples
  for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
    channels.push(audioBuffer.getChannelData(i));
  }

  while (pos < buffer.byteLength) {
    for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
      let sample = Math.max(-1, Math.min(1, channels[i][offset]));
      sample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * Generate complete fixture pattern
 */
export async function generateFixturePattern(pattern: FixturePattern) {
  const chunks = [];
  let currentTime = 0;

  for (let i = 0; i < pattern.chunks.length; i++) {
    const chunkSpec = pattern.chunks[i];
    const blob = await generateFixtureChunk(chunkSpec.duration, chunkSpec.loudness);
    
    chunks.push({
      id: `fixture-chunk-${i}`,
      seq: i,
      blob,
      startTime: currentTime,
      endTime: currentTime + chunkSpec.duration,
      duration: chunkSpec.duration,
    });
    
    currentTime += chunkSpec.duration;
  }

  return chunks;
}
