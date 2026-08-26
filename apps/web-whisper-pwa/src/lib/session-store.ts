// Stub implementation of session-store package
// Based on packages/datastore/session-store/customers/web-whisper-pwa.md

export interface Session {
  id: string
  createdAt: string
  duration: number
  chunkCount: number
  sizeBytes: number
  hasVolumeProfile: boolean
  hasSnips: boolean
  hasTranscript: boolean
}

export interface Chunk {
  id: string
  sessionId: string
  seq: number
  startTime: number
  endTime: number
  duration: number
  sizeBytes: number
  blob?: Blob
}

export interface Snip {
  id: string
  sessionId: string
  startTime: number
  endTime: number
  duration: number
  chunkIds: string[]
  confidence: number
  createdAt: string
}

export interface Transcript {
  snipId: string
  sessionId: string
  text: string
  createdAt: string
  updatedAt: string
}

export interface StorageStats {
  usedBytes: number
  capBytes: number
  sessionCount: number
  chunkCount: number
}

class SessionStore {
  private db: IDBDatabase | null = null
  private readonly DB_NAME = 'web-whisper-store'
  private readonly DB_VERSION = 1

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION)
      
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        this.db = request.result
        resolve()
      }
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        
        if (!db.objectStoreNames.contains('sessions')) {
          const sessionStore = db.createObjectStore('sessions', { keyPath: 'id' })
          sessionStore.createIndex('createdAt', 'createdAt', { unique: false })
        }
        
        if (!db.objectStoreNames.contains('chunks')) {
          const chunkStore = db.createObjectStore('chunks', { keyPath: 'id' })
          chunkStore.createIndex('sessionId-seq', ['sessionId', 'seq'], { unique: true })
        }
        
        if (!db.objectStoreNames.contains('snips')) {
          const snipStore = db.createObjectStore('snips', { keyPath: 'id' })
          snipStore.createIndex('sessionId', 'sessionId', { unique: false })
        }
        
        if (!db.objectStoreNames.contains('transcripts')) {
          const transcriptStore = db.createObjectStore('transcripts', { keyPath: 'snipId' })
          transcriptStore.createIndex('sessionId', 'sessionId', { unique: false })
        }
      }
    })
  }

  async createSession(): Promise<{ id: string } | { error: string }> {
    if (!this.db) await this.init()
    
    const id = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const session: Session = {
      id,
      createdAt: new Date().toISOString(),
      duration: 0,
      chunkCount: 0,
      sizeBytes: 0,
      hasVolumeProfile: false,
      hasSnips: false,
      hasTranscript: false
    }
    
    return new Promise((resolve) => {
      const tx = this.db!.transaction(['sessions'], 'readwrite')
      tx.objectStore('sessions').add(session)
      tx.oncomplete = () => resolve({ id })
      tx.onerror = () => resolve({ error: 'database_unavailable' })
    })
  }

  async listSessions(options?: { limit?: number; offset?: number }): Promise<{ sessions: Session[]; total: number } | { error: string }> {
    if (!this.db) await this.init()
    
    const limit = options?.limit ?? 100
    const offset = options?.offset ?? 0
    
    return new Promise((resolve) => {
      const tx = this.db!.transaction(['sessions'], 'readonly')
      const store = tx.objectStore('sessions')
      const index = store.index('createdAt')
      const request = index.openCursor(null, 'prev')
      
      const sessions: Session[] = []
      let count = 0
      let total = 0
      
      request.onsuccess = () => {
        const cursor = request.result
        if (cursor) {
          total++
          if (count >= offset && sessions.length < limit) {
            sessions.push(cursor.value)
          }
          count++
          cursor.continue()
        } else {
          resolve({ sessions, total })
        }
      }
      
      request.onerror = () => resolve({ error: 'database_unavailable' })
    })
  }

  async getSession(sessionId: string): Promise<Session | null | { error: string }> {
    if (!this.db) await this.init()
    
    return new Promise((resolve) => {
      const tx = this.db!.transaction(['sessions'], 'readonly')
      const request = tx.objectStore('sessions').get(sessionId)
      
      request.onsuccess = () => resolve(request.result ?? null)
      request.onerror = () => resolve({ error: 'database_unavailable' })
    })
  }

  async deleteSession(sessionId: string): Promise<{ deleted: true } | { error: string }> {
    if (!this.db) await this.init()
    
    return new Promise((resolve) => {
      const tx = this.db!.transaction(['sessions', 'chunks', 'snips', 'transcripts'], 'readwrite')
      
      tx.objectStore('sessions').delete(sessionId)
      
      const chunkIndex = tx.objectStore('chunks').index('sessionId-seq')
      const chunkRequest = chunkIndex.openCursor(IDBKeyRange.bound([sessionId, 0], [sessionId, Infinity]))
      chunkRequest.onsuccess = () => {
        const cursor = chunkRequest.result
        if (cursor) {
          cursor.delete()
          cursor.continue()
        }
      }
      
      tx.oncomplete = () => resolve({ deleted: true })
      tx.onerror = () => resolve({ error: 'database_unavailable' })
    })
  }

  async getStorageStats(): Promise<StorageStats | { error: string }> {
    if (!this.db) await this.init()
    
    const capBytes = parseInt(localStorage.getItem('storage_cap_mb') || '200') * 1024 * 1024
    
    return new Promise((resolve) => {
      const tx = this.db!.transaction(['sessions', 'chunks'], 'readonly')
      
      const sessionRequest = tx.objectStore('sessions').count()
      const chunkRequest = tx.objectStore('chunks').getAll()
      
      let sessionCount = 0
      let usedBytes = 0
      let chunkCount = 0
      
      sessionRequest.onsuccess = () => {
        sessionCount = sessionRequest.result
      }
      
      chunkRequest.onsuccess = () => {
        const chunks = chunkRequest.result as Chunk[]
        chunkCount = chunks.length
        usedBytes = chunks.reduce((sum, chunk) => sum + chunk.sizeBytes, 0)
      }
      
      tx.oncomplete = () => {
        resolve({ usedBytes, capBytes, sessionCount, chunkCount })
      }
      
      tx.onerror = () => resolve({ error: 'database_unavailable' })
    })
  }

  async writeChunk(sessionId: string, blob: Blob, metadata: { seq: number; startTime: number; endTime: number }): Promise<void> {
    if (!this.db) await this.init()
    
    const chunkId = `chunk_${sessionId}_${String(metadata.seq).padStart(3, '0')}`
    const chunk: Chunk = {
      id: chunkId,
      sessionId,
      seq: metadata.seq,
      startTime: metadata.startTime,
      endTime: metadata.endTime,
      duration: metadata.endTime - metadata.startTime,
      sizeBytes: blob.size,
      blob
    }
    
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(['chunks', 'sessions'], 'readwrite')
      
      tx.objectStore('chunks').add(chunk)
      
      const sessionRequest = tx.objectStore('sessions').get(sessionId)
      sessionRequest.onsuccess = () => {
        const session = sessionRequest.result as Session
        if (session) {
          session.chunkCount++
          session.sizeBytes += blob.size
          session.duration = metadata.endTime
          tx.objectStore('sessions').put(session)
        }
      }
      
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  async getChunksForSession(sessionId: string): Promise<{ chunks: Chunk[] } | { error: string }> {
    if (!this.db) await this.init()
    
    return new Promise((resolve) => {
      const tx = this.db!.transaction(['chunks'], 'readonly')
      const index = tx.objectStore('chunks').index('sessionId-seq')
      const request = index.getAll(IDBKeyRange.bound([sessionId, 0], [sessionId, Infinity]))
      
      request.onsuccess = () => {
        const chunks = request.result.map((chunk: Chunk) => ({
          ...chunk,
          blob: undefined
        }))
        resolve({ chunks })
      }
      
      request.onerror = () => resolve({ error: 'database_unavailable' })
    })
  }

  async getChunk(chunkId: string): Promise<Chunk | null> {
    if (!this.db) await this.init()
    
    return new Promise((resolve) => {
      const tx = this.db!.transaction(['chunks'], 'readonly')
      const request = tx.objectStore('chunks').get(chunkId)
      
      request.onsuccess = () => resolve(request.result ?? null)
      request.onerror = () => resolve(null)
    })
  }
}

export const sessionStore = new SessionStore()
