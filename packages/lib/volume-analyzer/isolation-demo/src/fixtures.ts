/**
 * Fixture Audio Generator
 *
 * Generate synthetic WAV chunks with known volume patterns for testing.
 */

export interface FixturePattern {
  id: string;
  name: string;
  description: string;
  chunks: Array<{
    duration: number; // seconds
    loudness: 'quiet' | 'loud';
  }>;
}

export const FIXTURE_PATTERNS: FixturePattern[] = [
  {
    id: 'breath-paused-speech',
    name: 'Breath-paused speech (run-on)',
    description:
      '24s of 2.2s phrases with 1.1s breaths — old split-every-gap cuts every 4–5 words; original target-length keeps ~10s snips',
    chunks: Array.from({ length: 7 }, () => [
      { duration: 2.2, loudness: 'loud' as const },
      { duration: 1.1, loudness: 'quiet' as const },
    ]).flat(),
  },
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
    chunks: [{ duration: 10, loudness: 'quiet' }],
  },
  {
    id: 'all-loud',
    name: 'All Loud',
    description: '10s of continuous speech',
    chunks: [{ duration: 10, loudness: 'loud' }],
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
    chunks: [{ duration: 3, loudness: 'loud' }],
  },
];

export async function generateFixtureChunk(
  duration: number,
  loudness: 'quiet' | 'loud'
): Promise<Blob> {
  const sampleRate = 48000;
  const audioContext = new OfflineAudioContext(1, sampleRate * duration, sampleRate);

  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.frequency.value = 440;
  oscillator.type = 'sine';

  // quiet ~= -54dB, loud ~= -14dB
  const gain = loudness === 'quiet' ? 0.002 : 0.2;
  gainNode.gain.value = gain;

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.start(0);
  oscillator.stop(duration);

  const audioBuffer = await audioContext.startRendering();
  return audioBufferToWav(audioBuffer);
}

function audioBufferToWav(audioBuffer: AudioBuffer): Blob {
  const length = audioBuffer.length * audioBuffer.numberOfChannels * 2;
  const buffer = new ArrayBuffer(44 + length);
  const view = new DataView(buffer);
  const channels: Float32Array[] = [];
  let offset = 0;
  let pos = 0;

  const setUint16 = (data: number) => {
    view.setUint16(pos, data, true);
    pos += 2;
  };
  const setUint32 = (data: number) => {
    view.setUint32(pos, data, true);
    pos += 4;
  };

  setUint32(0x46464952);
  setUint32(36 + length);
  setUint32(0x45564157);
  setUint32(0x20746d66);
  setUint32(16);
  setUint16(1);
  setUint16(audioBuffer.numberOfChannels);
  setUint32(audioBuffer.sampleRate);
  setUint32(audioBuffer.sampleRate * 2 * audioBuffer.numberOfChannels);
  setUint16(audioBuffer.numberOfChannels * 2);
  setUint16(16);
  setUint32(0x61746164);
  setUint32(length);

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

export const FIXTURE_CHUNK_SECONDS = 4;

export type FixtureTickSpec = {
  seq: number;
  startTime: number;
  endTime: number;
  duration: number;
  pieces: Array<{ duration: number; loudness: 'quiet' | 'loud' }>;
};

export function fixtureTotalDuration(pattern: FixturePattern): number {
  return pattern.chunks.reduce((sum, chunk) => sum + chunk.duration, 0);
}

function piecesInRange(
  pattern: FixturePattern,
  start: number,
  end: number
): Array<{ duration: number; loudness: 'quiet' | 'loud' }> {
  const pieces: Array<{ duration: number; loudness: 'quiet' | 'loud' }> = [];
  let cursor = 0;
  for (const segment of pattern.chunks) {
    const segmentEnd = cursor + segment.duration;
    const overlapStart = Math.max(start, cursor);
    const overlapEnd = Math.min(end, segmentEnd);
    if (overlapEnd > overlapStart + 1e-9) {
      pieces.push({ duration: overlapEnd - overlapStart, loudness: segment.loudness });
    }
    cursor = segmentEnd;
  }
  return pieces;
}

/** Pack fixture patterns into ~4s ticks (same cadence as capture-engine chunkEncoded). */
export function fixtureTickSpecs(pattern: FixturePattern): FixtureTickSpec[] {
  const total = fixtureTotalDuration(pattern);
  const ticks: FixtureTickSpec[] = [];
  let t = 0;
  let seq = 0;
  while (t < total - 1e-9) {
    const end = Math.min(t + FIXTURE_CHUNK_SECONDS, total);
    ticks.push({
      seq,
      startTime: t,
      endTime: end,
      duration: end - t,
      pieces: piecesInRange(pattern, t, end),
    });
    t = end;
    seq += 1;
  }
  return ticks;
}

export async function generateFixtureTick(spec: FixtureTickSpec) {
  const sampleRate = 48000;
  const frameCount = Math.max(1, Math.round(sampleRate * spec.duration));
  const audioContext = new OfflineAudioContext(1, frameCount, sampleRate);
  let offset = 0;
  for (const piece of spec.pieces) {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.frequency.value = 440;
    oscillator.type = 'sine';
    gainNode.gain.value = piece.loudness === 'quiet' ? 0.002 : 0.2;
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.start(offset);
    oscillator.stop(offset + piece.duration);
    offset += piece.duration;
  }
  const audioBuffer = await audioContext.startRendering();
  return {
    id: `fixture-chunk-${spec.seq}`,
    seq: spec.seq,
    blob: audioBufferToWav(audioBuffer),
    startTime: spec.startTime,
    endTime: spec.endTime,
    duration: spec.duration,
  };
}

export async function generateFixturePattern(pattern: FixturePattern) {
  const ticks = fixtureTickSpecs(pattern);
  const chunks = [];
  for (const spec of ticks) {
    chunks.push(await generateFixtureTick(spec));
  }
  return chunks;
}
