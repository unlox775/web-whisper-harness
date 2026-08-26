import type { SessionStore, Session, Chunk, VolumeProfile, Snip, Transcript } from './types'

// Simple IndexedDB wrapper
class DB {
  private dbPromise: Promise<IDBDatabase>

  constructor() {
    this.dbPromise = this.initDB()
  }

  private async initDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('WebWhisperDB', 1)
      
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        
        // Create object stores
        if (!db.objectStoreNames.contains('sessions')) {
          db.createObjectStore('sessions', { keyPath: 'sessionId' })
        }
        if (!db.objectStoreNames.contains('chunks')) {
          const chunkStore = db.createObjectStore('chunks', { keyPath: 'chunkId' })
          chunkStore.createIndex('sessionId', 'sessionId', { unique: false })
        }
        if (!db.objectStoreNames.contains('volumeProfiles')) {
          const vpStore = db.createObjectStore('volumeProfiles', { keyPath: 'chunkId' })
          vpStore.createIndex('sessionId', 'sessionId', { unique: false })
        }
        if (!db.objectStoreNames.contains('snips')) {
          const snipStore = db.createObjectStore('snips', { keyPath: 'snipId' })
          snipStore.createIndex('sessionId', 'sessionId', { unique: false })
        }
        if (!db.objectStoreNames.contains('transcripts')) {
          const transcriptStore = db.createObjectStore('transcripts', { keyPath: 'transcriptId' })
          transcriptStore.createIndex('sessionId', 'sessionId', { unique: false })
          transcriptStore.createIndex('snipId', 'snipId', { unique: false })
        }
      }
    })
  }

  async get<T>(storeName: string, key: string): Promise<T | null> {
    const db = await this.dbPromise
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly')
      const store = tx.objectStore(storeName)
      const request = store.get(key)
      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => reject(request.error)
    })
  }

  async put<T>(storeName: string, value: T): Promise<void> {
    const db = await this.dbPromise
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite')
      const store = tx.objectStore(storeName)
      const request = store.put(value)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async getAll<T>(storeName: string): Promise<T[]> {
    const db = await this.dbPromise
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly')
      const store = tx.objectStore(storeName)
      const request = store.getAll()
      request.onsuccess = () => resolve(request.result || [])
      request.onerror = () => reject(request.error)
    })
  }

  async getAllByIndex<T>(storeName: string, indexName: string, key: string): Promise<T[]> {
    const db = await this.dbPromise
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly')
      const store = tx.objectStore(storeName)
      const index = store.index(indexName)
      const request = index.getAll(key)
      request.onsuccess = () => resolve(request.result || [])
      request.onerror = () => reject(request.error)
    })
  }

  async delete(storeName: string, key: string): Promise<void> {
    const db = await this.dbPromise
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite')
      const store = tx.objectStore(storeName)
      const request = store.delete(key)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async clear(storeName: string): Promise<void> {
    const db = await this.dbPromise
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite')
      const store = tx.objectStore(storeName)
      const request = store.clear()
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }
}

const db = new DB()

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

export const sessionStore: SessionStore = {
  async createSession() {
    const sessionId = generateId('session')
    const session: Session = {
      sessionId,
      timestamp: Date.now(),
      duration: 0,
      status: 'active',
      chunkCount: 0,
      hasAudio: false,
    }
    await db.put('sessions', session)
    return { sessionId }
  },

  async getSession(sessionId: string) {
    return db.get<Session>('sessions', sessionId)
  },

  async listSessions() {
    const sessions = await db.getAll<Session>('sessions')
    return sessions.sort((a, b) => b.timestamp - a.timestamp)
  },

  async deleteSession(sessionId: string) {
    // Delete session and all related data
    await db.delete('sessions', sessionId)
    const chunks = await db.getAllByIndex<Chunk>('chunks', 'sessionId', sessionId)
    for (const chunk of chunks) {
      await db.delete('chunks', chunk.chunkId)
    }
    const volumeProfiles = await db.getAllByIndex<VolumeProfile>('volumeProfiles', 'sessionId', sessionId)
    for (const vp of volumeProfiles) {
      await db.delete('volumeProfiles', vp.chunkId)
    }
    const snips = await db.getAllByIndex<Snip>('snips', 'sessionId', sessionId)
    for (const snip of snips) {
      await db.delete('snips', snip.snipId)
    }
    const transcripts = await db.getAllByIndex<Transcript>('transcripts', 'sessionId', sessionId)
    for (const transcript of transcripts) {
      await db.delete('transcripts', transcript.transcriptId)
    }
  },

  async getChunksForSession(sessionId: string) {
    return db.getAllByIndex<Chunk>('chunks', 'sessionId', sessionId)
  },

  async writeChunk(sessionId: string, chunkData) {
    const chunkId = generateId('chunk')
    const chunk: Chunk = { ...chunkData, chunkId, sessionId }
    await db.put('chunks', chunk)
    
    // Update session
    const session = await db.get<Session>('sessions', sessionId)
    if (session) {
      session.chunkCount++
      session.hasAudio = true
      session.duration = Math.max(session.duration, chunkData.startTime + chunkData.duration)
      await db.put('sessions', session)
    }
    
    return { chunkId }
  },

  async writeVolumeProfile(sessionId: string, chunkId: string, volumeSamples: Float32Array) {
    const maxVolume = Math.max(...Array.from(volumeSamples))
    const avgVolume = Array.from(volumeSamples).reduce((a, b) => a + b, 0) / volumeSamples.length
    
    const vp: VolumeProfile = {
      chunkId,
      sessionId,
      volumeSamples,
      maxVolume,
      avgVolume,
    }
    await db.put('volumeProfiles', vp)
  },

  async getVolumeProfiles(sessionId: string) {
    return db.getAllByIndex<VolumeProfile>('volumeProfiles', 'sessionId', sessionId)
  },

  async writeSnip(sessionId: string, snipData) {
    const snipId = generateId('snip')
    const snip: Snip = { ...snipData, snipId, sessionId }
    await db.put('snips', snip)
    return { snipId }
  },

  async getSnips(sessionId: string) {
    return db.getAllByIndex<Snip>('snips', 'sessionId', sessionId)
  },

  async writeTranscript(sessionId: string, snipId: string, text: string) {
    const transcriptId = generateId('transcript')
    const transcript: Transcript = {
      transcriptId,
      sessionId,
      snipId,
      text,
      timestamp: Date.now(),
    }
    await db.put('transcripts', transcript)
  },

  async getTranscripts(sessionId: string) {
    return db.getAllByIndex<Transcript>('transcripts', 'sessionId', sessionId)
  },

  async enforceRetentionPolicy(_capMB: number) {
    // Simplified: just delete oldest sessions if over cap
    const deletedSessions: string[] = []
    // For now, return empty array - would implement actual size checking
    return { deletedSessions }
  },

  async getStorageUsage() {
    // Approximate storage usage
    const chunks = await db.getAll<Chunk>('chunks')
    
    let usedBytes = 0
    for (const chunk of chunks) {
      usedBytes += chunk.byteSize
    }
    
    return { usedBytes, capBytes: 200 * 1024 * 1024 } // Default 200MB cap
  },

  async clearAll() {
    await db.clear('sessions')
    await db.clear('chunks')
    await db.clear('volumeProfiles')
    await db.clear('snips')
    await db.clear('transcripts')
  },
}
