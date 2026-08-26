// IndexedDB schema and durable storage authority for all Web Whisper data

export interface Session {
  sessionId: string
  createdAt: number
  duration: number
  chunkCount: number
  sizeBytes: number
  hasVolumeProfile: boolean
  hasSnips: boolean
  hasTranscript: boolean
  status: 'active' | 'completed' | 'no-audio'
}

export interface Chunk {
  chunkId: string
  sessionId: string
  seq: number
  startTime: number
  duration: number
  sizeBytes: number
  blob: Blob
}

export interface VolumeProfile {
  sessionId: string
  chunkVolumes: Array<{
    chunkId: string
    chunkIndex: number
    avgDb: number
    peakDb: number
    samples: Float32Array
  }>
}

export interface Snip {
  snipId: string
  sessionId: string
  startTime: number
  endTime: number
  startChunkIndex: number
  endChunkIndex: number
  chunkRefs: string[]
  confidence: number
}

export interface Transcript {
  snipId: string
  sessionId: string
  text: string
  language?: string
}

// IndexedDB helper
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
        
        if (!db.objectStoreNames.contains('sessions')) {
          db.createObjectStore('sessions', { keyPath: 'sessionId' })
        }
        if (!db.objectStoreNames.contains('chunks')) {
          const chunkStore = db.createObjectStore('chunks', { keyPath: 'chunkId' })
          chunkStore.createIndex('sessionId', 'sessionId', { unique: false })
          chunkStore.createIndex('sessionSeq', ['sessionId', 'seq'], { unique: true })
        }
        if (!db.objectStoreNames.contains('volumeProfiles')) {
          db.createObjectStore('volumeProfiles', { keyPath: 'sessionId' })
        }
        if (!db.objectStoreNames.contains('snips')) {
          const snipStore = db.createObjectStore('snips', { keyPath: 'snipId' })
          snipStore.createIndex('sessionId', 'sessionId', { unique: false })
        }
        if (!db.objectStoreNames.contains('transcripts')) {
          const transcriptStore = db.createObjectStore('transcripts', { keyPath: 'snipId' })
          transcriptStore.createIndex('sessionId', 'sessionId', { unique: false })
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

// Session Operations
export async function createSession(): Promise<{ sessionId: string }> {
  const sessionId = generateId('session')
  const session: Session = {
    sessionId,
    createdAt: Date.now(),
    duration: 0,
    chunkCount: 0,
    sizeBytes: 0,
    hasVolumeProfile: false,
    hasSnips: false,
    hasTranscript: false,
    status: 'active',
  }
  await db.put('sessions', session)
  return { sessionId }
}

export async function getSession(sessionId: string): Promise<Session | null> {
  return db.get<Session>('sessions', sessionId)
}

export async function listSessions(): Promise<Session[]> {
  const sessions = await db.getAll<Session>('sessions')
  return sessions.sort((a, b) => b.createdAt - a.createdAt)
}

export async function deleteSession(sessionId: string): Promise<void> {
  await db.delete('sessions', sessionId)
  const chunks = await db.getAllByIndex<Chunk>('chunks', 'sessionId', sessionId)
  for (const chunk of chunks) {
    await db.delete('chunks', chunk.chunkId)
  }
  await db.delete('volumeProfiles', sessionId)
  const snips = await db.getAllByIndex<Snip>('snips', 'sessionId', sessionId)
  for (const snip of snips) {
    await db.delete('snips', snip.snipId)
    await db.delete('transcripts', snip.snipId)
  }
}

// Chunk Operations
export async function writeChunk(sessionId: string, chunkData: {
  seq: number
  startTime: number
  duration: number
  blob: Blob
}): Promise<{ chunkId: string }> {
  const chunkId = generateId('chunk')
  const chunk: Chunk = {
    ...chunkData,
    chunkId,
    sessionId,
    sizeBytes: chunkData.blob.size,
  }
  await db.put('chunks', chunk)
  
  // Update session
  const session = await db.get<Session>('sessions', sessionId)
  if (session) {
    session.chunkCount++
    session.sizeBytes += chunk.sizeBytes
    session.duration = Math.max(session.duration, chunkData.startTime + chunkData.duration)
    await db.put('sessions', session)
  }
  
  return { chunkId }
}

export async function getChunk(chunkId: string): Promise<Chunk | null> {
  return db.get<Chunk>('chunks', chunkId)
}

export async function getChunksForSession(sessionId: string): Promise<Chunk[]> {
  const chunks = await db.getAllByIndex<Chunk>('chunks', 'sessionId', sessionId)
  return chunks.sort((a, b) => a.seq - b.seq)
}

// Volume Profile Operations
export async function writeVolumeProfile(sessionId: string, profile: Omit<VolumeProfile, 'sessionId'>): Promise<void> {
  const volumeProfile: VolumeProfile = { ...profile, sessionId }
  await db.put('volumeProfiles', volumeProfile)
  
  const session = await db.get<Session>('sessions', sessionId)
  if (session) {
    session.hasVolumeProfile = true
    await db.put('sessions', session)
  }
}

export async function getVolumeProfile(sessionId: string): Promise<VolumeProfile | null> {
  return db.get<VolumeProfile>('volumeProfiles', sessionId)
}

// Snip Operations
export async function writeSnip(sessionId: string, snipData: Omit<Snip, 'snipId' | 'sessionId'>): Promise<{ snipId: string }> {
  const snipId = generateId('snip')
  const snip: Snip = { ...snipData, snipId, sessionId }
  await db.put('snips', snip)
  
  const session = await db.get<Session>('sessions', sessionId)
  if (session) {
    session.hasSnips = true
    await db.put('sessions', session)
  }
  
  return { snipId }
}

export async function getSnipsForSession(sessionId: string): Promise<Snip[]> {
  const snips = await db.getAllByIndex<Snip>('snips', 'sessionId', sessionId)
  return snips.sort((a, b) => a.startTime - b.startTime)
}

export async function getSnip(snipId: string): Promise<Snip | null> {
  return db.get<Snip>('snips', snipId)
}

// Transcript Operations
export async function writeTranscript(snipId: string, text: string, language?: string): Promise<void> {
  const snip = await db.get<Snip>('snips', snipId)
  if (!snip) throw new Error('Snip not found')
  
  const transcript: Transcript = {
    snipId,
    sessionId: snip.sessionId,
    text,
    language,
  }
  await db.put('transcripts', transcript)
  
  const session = await db.get<Session>('sessions', snip.sessionId)
  if (session) {
    session.hasTranscript = true
    await db.put('sessions', session)
  }
}

export async function getTranscript(snipId: string): Promise<Transcript | null> {
  return db.get<Transcript>('transcripts', snipId)
}

export async function getTranscriptsForSession(sessionId: string): Promise<Transcript[]> {
  return db.getAllByIndex<Transcript>('transcripts', 'sessionId', sessionId)
}

// Storage Management
export async function getStorageStats(): Promise<{
  usedBytes: number
  capBytes: number
  sessionCount: number
  chunkCount: number
}> {
  const sessions = await db.getAll<Session>('sessions')
  const chunks = await db.getAll<Chunk>('chunks')
  
  let usedBytes = 0
  for (const chunk of chunks) {
    usedBytes += chunk.sizeBytes
  }
  
  return {
    usedBytes,
    capBytes: 200 * 1024 * 1024, // Default 200MB cap
    sessionCount: sessions.length,
    chunkCount: chunks.length,
  }
}

export async function enforceRetentionPolicy(capBytes?: number): Promise<{ deletedSessions: string[] }> {
  const cap = capBytes || 200 * 1024 * 1024
  const stats = await getStorageStats()
  const deletedSessions: string[] = []
  
  if (stats.usedBytes <= cap) {
    return { deletedSessions }
  }
  
  // Delete oldest sessions until under cap
  const sessions = await listSessions() // Already sorted by createdAt desc
  sessions.reverse() // Oldest first
  
  for (const session of sessions) {
    if (stats.usedBytes - session.sizeBytes <= cap) {
      break
    }
    await deleteSession(session.sessionId)
    deletedSessions.push(session.sessionId)
    stats.usedBytes -= session.sizeBytes
  }
  
  return { deletedSessions }
}

export async function clearAll(): Promise<void> {
  await db.clear('sessions')
  await db.clear('chunks')
  await db.clear('volumeProfiles')
  await db.clear('snips')
  await db.clear('transcripts')
}
