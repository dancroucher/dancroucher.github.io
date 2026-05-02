import { openDB, IDBPDatabase } from 'idb';
import type { Tape } from './types';

const DB_NAME = 'jeem-fm';
const DB_VERSION = 1;
const STORE = 'tapes';

let _db: IDBPDatabase | null = null;

async function getDB(): Promise<IDBPDatabase> {
  if (!_db) {
    _db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id' });
        }
      },
    });
  }
  return _db;
}

export async function loadTapes(): Promise<Tape[]> {
  const db = await getDB();
  return db.getAll(STORE);
}

export async function saveTapes(tapes: Tape[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(STORE, 'readwrite');
  await tx.store.clear();
  await Promise.all(tapes.map(tape => tx.store.put(tape)));
  await tx.done;
}


