import type { PlaybackHandle, PlaybackError } from './types.js';
import { PlaybackHandleImpl } from './playback-handle.js';
import { fixtureStore } from './fixture-store.js';

type SessionStoreModule = typeof import('../../../datastore/session-store/src/index.js');

async function loadSessionStore(): Promise<SessionStoreModule | null> {
  try {
    return await import('../../../datastore/session-store/src/index.js');
  } catch {
    return null;
  }
}

async function startHandle(blob: Blob): Promise<PlaybackHandle> {
  const handle = new PlaybackHandleImpl(blob);
  await handle.start();
  return handle;
}

/**
 * Play concatenated MP3 blobs from RAM (isolation demos / in-memory capture).
 * Does not open session-store or IndexedDB.
 */
export async function playBlobs(
  blobs: Blob[]
): Promise<PlaybackHandle | PlaybackError> {
  if (!blobs || blobs.length === 0) {
    return { error: 'no_chunks' };
  }
  const valid = blobs.filter((blob) => blob instanceof Blob);
  if (valid.length === 0) {
    return { error: 'invalid_blob' };
  }
  return startHandle(new Blob(valid, { type: 'audio/mpeg' }));
}

export async function playSession(
  sessionId: string
): Promise<PlaybackHandle | PlaybackError> {
  const store = await loadSessionStore();
  if (store) {
    const session = await store.getSession(sessionId);
    if (session) {
      const listed = await store.getChunksForSession(sessionId);
      if (listed.error) {
        return { error: 'chunks_missing', sessionId, missingChunkIds: [] };
      }
      const metas = listed.chunks || [];
      if (metas.length === 0) {
        return { error: 'chunks_missing', sessionId, missingChunkIds: [] };
      }
      const blobs: Blob[] = [];
      const missingChunkIds: string[] = [];
      for (const meta of metas) {
        const chunk = await store.getChunk(meta.id);
        if (!chunk?.blob) {
          missingChunkIds.push(meta.id);
        } else {
          blobs.push(chunk.blob);
        }
      }
      if (blobs.length === 0) {
        return { error: 'chunks_missing', sessionId, missingChunkIds };
      }
      return startHandle(new Blob(blobs, { type: 'audio/mpeg' }));
    }
  }

  const session = await fixtureStore.getSession(sessionId);
  if (!session) {
    return { error: 'session_not_found', sessionId };
  }

  const chunks = await fixtureStore.listChunks(sessionId);
  if (chunks.length === 0) {
    return {
      error: 'chunks_missing',
      sessionId,
      missingChunkIds: session.chunkIds,
    };
  }

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

  const chunkBlobs = chunks.map(chunk => chunk.blob);
  return startHandle(new Blob(chunkBlobs, { type: 'audio/mpeg' }));
}

export async function playChunk(
  chunkId: string
): Promise<PlaybackHandle | PlaybackError> {
  const store = await loadSessionStore();
  if (store) {
    const chunk = await store.getChunk(chunkId);
    if (chunk?.blob) {
      return startHandle(chunk.blob);
    }
    if (chunk && !chunk.blob) {
      return { error: 'chunk_read_failed', chunkId };
    }
  }

  const chunk = await fixtureStore.getChunk(chunkId);
  if (!chunk) {
    return { error: 'chunk_not_found', chunkId };
  }

  if (!chunk.blob) {
    return { error: 'chunk_read_failed', chunkId };
  }

  return startHandle(chunk.blob);
}

export async function playSnip(
  snipId: string
): Promise<PlaybackHandle | PlaybackError> {
  const store = await loadSessionStore();
  if (store) {
    const snip = await store.getSnip(snipId);
    if (snip) {
      const chunkIds: string[] = snip.chunkIds || snip.chunkRefs || [];
      const missingChunkIds: string[] = [];
      const blobs: Blob[] = [];
      for (const chunkId of chunkIds) {
        const chunk = await store.getChunk(chunkId);
        if (!chunk?.blob) {
          missingChunkIds.push(chunkId);
        } else {
          blobs.push(chunk.blob);
        }
      }
      if (blobs.length === 0) {
        return { error: 'snip_chunks_missing', snipId, missingChunkIds };
      }
      return startHandle(new Blob(blobs, { type: 'audio/mpeg' }));
    }
  }

  const snip = await fixtureStore.getSnip(snipId);
  if (!snip) {
    return { error: 'snip_not_found', snipId };
  }

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

  const chunkBlobs = chunks.map(chunk => chunk.blob);
  return startHandle(new Blob(chunkBlobs, { type: 'audio/mpeg' }));
}
