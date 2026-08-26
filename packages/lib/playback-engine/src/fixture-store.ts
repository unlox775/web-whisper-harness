import { SessionData, ChunkData, SnipData } from './types.js';

// Generate simple audio blobs with different tones for distinguishability
function generateAudioBlob(durationSeconds: number, frequency: number): Blob {
  // For now, return a minimal MP3 header as a placeholder
  // In production, this would use Web Audio API or pre-encoded MP3s
  // The actual audio content isn't critical for the core logic validation
  const sampleRate = 44100;
  const numSamples = Math.floor(durationSeconds * sampleRate);
  const header = new Uint8Array([
    0xFF, 0xFB, 0x90, 0x00, // MP3 frame header (MPEG-1 Layer 3, 128kbps, 44100Hz)
  ]);
  
  // Create a simple audio buffer (this is a mock; real implementation would encode properly)
  const dataSize = Math.floor(durationSeconds * 16000); // Approximate size at 128kbps
  const data = new Uint8Array(dataSize);
  
  // Fill with some pattern to simulate audio data
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.sin(2 * Math.PI * frequency * i / sampleRate) * 127 + 128) & 0xFF;
  }
  
  return new Blob([header, data], { type: 'audio/mpeg' });
}

class FixtureStore {
  private chunks: Map<string, ChunkData> = new Map();
  private sessions: Map<string, SessionData> = new Map();
  private snips: Map<string, SnipData> = new Map();
  private initialized: boolean = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Generate fixture chunks with distinguishable audio
    const chunk0 = {
      chunkId: 'demo-chunk-000',
      sessionId: 'demo-session-001',
      seq: 0,
      startTime: 0.0,
      endTime: 4.0,
      duration: 4.0,
      blob: generateAudioBlob(4.0, 250), // 250 Hz tone
      blobSize: 32768,
    };

    const chunk1 = {
      chunkId: 'demo-chunk-001',
      sessionId: 'demo-session-001',
      seq: 1,
      startTime: 4.0,
      endTime: 8.1,
      duration: 4.1,
      blob: generateAudioBlob(4.1, 500), // 500 Hz tone
      blobSize: 33024,
    };

    const chunk2 = {
      chunkId: 'demo-chunk-002',
      sessionId: 'demo-session-001',
      seq: 2,
      startTime: 8.1,
      endTime: 11.6,
      duration: 3.5,
      blob: generateAudioBlob(3.5, 750), // 750 Hz tone
      blobSize: 28160,
    };

    this.chunks.set(chunk0.chunkId, chunk0);
    this.chunks.set(chunk1.chunkId, chunk1);
    this.chunks.set(chunk2.chunkId, chunk2);

    // Fixture session
    const session = {
      sessionId: 'demo-session-001',
      chunkIds: ['demo-chunk-000', 'demo-chunk-001', 'demo-chunk-002'],
      duration: 11.6,
      createdAt: new Date().toISOString(),
    };
    this.sessions.set(session.sessionId, session);

    // Fixture snips
    const snip0 = {
      snipId: 'demo-snip-000',
      sessionId: 'demo-session-001',
      label: 'First snip',
      startTime: 0.0,
      endTime: 8.1,
      duration: 8.1,
      chunkRefs: ['demo-chunk-000', 'demo-chunk-001'],
    };

    const snip1 = {
      snipId: 'demo-snip-001',
      sessionId: 'demo-session-001',
      label: 'Second snip',
      startTime: 8.1,
      endTime: 11.6,
      duration: 3.5,
      chunkRefs: ['demo-chunk-002'],
    };

    this.snips.set(snip0.snipId, snip0);
    this.snips.set(snip1.snipId, snip1);

    this.initialized = true;
  }

  async getSession(sessionId: string): Promise<SessionData | null> {
    await this.initialize();
    return this.sessions.get(sessionId) || null;
  }

  async getChunk(chunkId: string): Promise<ChunkData | null> {
    await this.initialize();
    return this.chunks.get(chunkId) || null;
  }

  async getSnip(snipId: string): Promise<SnipData | null> {
    await this.initialize();
    return this.snips.get(snipId) || null;
  }

  async listSessions(): Promise<SessionData[]> {
    await this.initialize();
    return Array.from(this.sessions.values());
  }

  async listChunks(sessionId: string): Promise<ChunkData[]> {
    await this.initialize();
    return Array.from(this.chunks.values())
      .filter(chunk => chunk.sessionId === sessionId)
      .sort((a, b) => a.seq - b.seq);
  }

  async listSnips(sessionId: string): Promise<SnipData[]> {
    await this.initialize();
    return Array.from(this.snips.values())
      .filter(snip => snip.sessionId === sessionId)
      .sort((a, b) => a.startTime - b.startTime);
  }
}

export const fixtureStore = new FixtureStore();
