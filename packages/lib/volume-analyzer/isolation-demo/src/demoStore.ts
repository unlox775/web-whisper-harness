/**
 * Isolated IndexedDB for this demo only.
 * Must never open web-whisper-db (PWA) or web-whisper-sandbox-db (other demos).
 */

export const VOLUME_ANALYZER_DEMO_DB = 'web-whisper-volume-analyzer-demo-db';
const STORE = 'tuner';
const KEY = 'snip-tuner';

export type TunerSettings = {
  quietThresholdDb: number;
  minSnipDuration: number;
  maxSnipDuration: number;
  minSilenceGapDuration: number;
  autoNoiseFloor: boolean;
};

function openDemoDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(VOLUME_ANALYZER_DEMO_DB, 1);
    request.onerror = () => reject(request.error ?? new Error('demo db open failed'));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
  });
}

export async function loadTunerSettings(): Promise<TunerSettings | null> {
  try {
    const db = await openDemoDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve((req.result as TunerSettings) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function saveTunerSettings(settings: TunerSettings): Promise<void> {
  try {
    const db = await openDemoDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).put(settings, KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Demo still works in-memory if IDB is blocked.
  }
}
