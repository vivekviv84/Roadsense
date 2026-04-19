/**
 * Offline mode: IndexedDB cache for last route + sync metadata,
 * plus dead-reckoning helpers when navigator.onLine is false.
 */

const DB_NAME = 'roadsense-offline-v1'
const STORE = 'kv'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const q = tx.objectStore(STORE).get(key)
    q.onsuccess = () => resolve(q.result as T | undefined)
    q.onerror = () => reject(q.error)
    tx.oncomplete = () => db.close()
  })
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(value, key)
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => reject(tx.error)
  })
}

export type CachedRoute = {
  coordinates: Array<[number, number]>
  label: string
  updatedAt: number
}

export async function cacheRoutePolyline(route: CachedRoute): Promise<void> {
  await idbSet('last_route', route)
}

export async function loadCachedRoute(): Promise<CachedRoute | null> {
  const v = await idbGet<CachedRoute>('last_route')
  return v ?? null
}

export async function setLastSyncTime(ts: number): Promise<void> {
  await idbSet('last_sync', ts)
}

export async function getLastSyncTime(): Promise<number | null> {
  const v = await idbGet<number>('last_sync')
  return typeof v === 'number' ? v : null
}

export function subscribeOnline(callback: (online: boolean) => void): () => void {
  const fn = () => callback(navigator.onLine)
  window.addEventListener('online', fn)
  window.addEventListener('offline', fn)
  return () => {
    window.removeEventListener('online', fn)
    window.removeEventListener('offline', fn)
  }
}
