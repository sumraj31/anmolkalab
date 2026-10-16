// IndexedDB-based reliable binary media storage for large video & image files
// Prevents DOMException: QuotaExceededError in localStorage

const DB_NAME = 'AnmolKalaMediaDB';
const DB_VERSION = 1;
const STORE_NAME = 'media_files';

interface StoredFileRecord {
  id: string;
  blob: Blob;
  mimeType: string;
  fileName: string;
  updatedAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;
const objectUrlCache = new Map<string, string>();

function getDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not available in this environment'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error || new Error('Failed to open IndexedDB'));
    };
  });

  return dbPromise;
}

/**
 * Save a video or image file to IndexedDB
 */
export async function saveMediaBlob(
  id: string,
  file: Blob | File,
  mimeType: string,
  fileName = 'file'
): Promise<string> {
  try {
    const db = await getDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const record: StoredFileRecord = {
        id,
        blob: file,
        mimeType: mimeType || file.type || 'video/mp4',
        fileName,
        updatedAt: Date.now(),
      };
      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });

    // Create a live object URL and cache it
    if (objectUrlCache.has(id)) {
      try {
        URL.revokeObjectURL(objectUrlCache.get(id)!);
      } catch (e) {}
    }
    const blobUrl = URL.createObjectURL(file);
    objectUrlCache.set(id, blobUrl);
    return blobUrl;
  } catch (err) {
    console.warn('IndexedDB save error, using direct object URL:', err);
    const blobUrl = URL.createObjectURL(file);
    objectUrlCache.set(id, blobUrl);
    return blobUrl;
  }
}

/**
 * Retrieve a stored video or image as a live Object URL
 */
export async function getMediaBlobUrl(id: string): Promise<string | null> {
  if (objectUrlCache.has(id)) {
    return objectUrlCache.get(id)!;
  }

  try {
    const db = await getDB();
    return await new Promise<string | null>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);

      req.onsuccess = () => {
        const record = req.result as StoredFileRecord | undefined;
        if (record && record.blob) {
          const url = URL.createObjectURL(record.blob);
          objectUrlCache.set(id, url);
          resolve(url);
        } else {
          resolve(null);
        }
      };

      req.onerror = () => {
        resolve(null);
      };
    });
  } catch (e) {
    return null;
  }
}

/**
 * Delete a media blob from IndexedDB
 */
export async function deleteMediaBlob(id: string): Promise<boolean> {
  try {
    if (objectUrlCache.has(id)) {
      try {
        URL.revokeObjectURL(objectUrlCache.get(id)!);
      } catch (e) {}
      objectUrlCache.delete(id);
    }
    const db = await getDB();
    return await new Promise<boolean>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  } catch (e) {
    return false;
  }
}

/**
 * Resolves a storage_path or video_url:
 * If it starts with idb://[id], fetch it from IndexedDB
 * If it's already an http/https/blob/data url, returns it directly
 */
export async function resolveMediaUrl(url: string | undefined): Promise<string> {
  if (!url) return '';
  if (url.startsWith('idb://')) {
    const id = url.replace('idb://', '');
    const resolved = await getMediaBlobUrl(id);
    return resolved || url;
  }
  return url;
}
