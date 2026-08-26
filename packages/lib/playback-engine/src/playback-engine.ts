import { PlaybackHandle, PlaybackError } from './types.js';
import { PlaybackHandleImpl } from './playback-handle.js';
import { fixtureStore } from './fixture-store.js';

export async function playSession(
  sessionId: string
): Promise<PlaybackHandle | PlaybackError> {
  // Read session metadata
  const session = await fixtureStore.getSession(sessionId);
  if (!session) {
    return { error: 'session_not_found', sessionId };
  }

  // Read all chunks for the session
  const chunks = await fixtureStore.listChunks(sessionId);
  if (chunks.length === 0) {
    return {
      error: 'chunks_missing',
      sessionId,
      missingChunkIds: session.chunkIds,
    };
  }

  // Verify all chunks exist
  const missingChunkIds: string[] = [];
  for (const chunkId of session.chunkIds) {
    const chunk = await fixtureStore.getChunk(chunkId);
    if (!chunk) {
      missingChunkIds.push(chunkId);
    }
  }

  if (missingChunkIds.length > 0) {
    return { error: 'chunks_missing', sessionId, missingChunkIds };
  }

  // Concatenate chunk blobs
  const chunkBlobs = chunks.map(chunk => chunk.blob);
  const sessionBlob = new Blob(chunkBlobs, { type: 'audio/mpeg' });

  // Create playback handle
  const handle = new PlaybackHandleImpl(sessionBlob);
  await handle.start();
  
  return handle;
}

export async function playChunk(
  chunkId: string
): Promise<PlaybackHandle | PlaybackError> {
  // Read chunk
  const chunk = await fixtureStore.getChunk(chunkId);
  if (!chunk) {
    return { error: 'chunk_not_found', chunkId };
  }

  if (!chunk.blob) {
    return { error: 'chunk_read_failed', chunkId };
  }

  // Create playback handle
  const handle = new PlaybackHandleImpl(chunk.blob);
  await handle.start();
  
  return handle;
}

export async function playSnip(
  snipId: string
): Promise<PlaybackHandle | PlaybackError> {
  // Read snip metadata
  const snip = await fixtureStore.getSnip(snipId);
  if (!snip) {
    return { error: 'snip_not_found', snipId };
  }

  // Read chunks for snip
  const missingChunkIds: string[] = [];
  const chunks = [];
  
  for (const chunkId of snip.chunkRefs) {
    const chunk = await fixtureStore.getChunk(chunkId);
    if (!chunk) {
      missingChunkIds.push(chunkId);
    } else {
      chunks.push(chunk);
    }
  }

  if (missingChunkIds.length > 0) {
    return {
      error: 'snip_chunks_missing',
      snipId,
      missingChunkIds,
    };
  }

  // Concatenate chunk blobs for snip
  const chunkBlobs = chunks.map(chunk => chunk.blob);
  const snipBlob = new Blob(chunkBlobs, { type: 'audio/mpeg' });

  // Create playback handle
  const handle = new PlaybackHandleImpl(snipBlob);
  await handle.start();
  
  return handle;
}
