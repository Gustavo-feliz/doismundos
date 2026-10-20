/**
 * Armazenamento bruto dos saves (texto por chave). Duas implementações:
 * IndexedDB no navegador (GDD §21.4) e memória (testes e plano B quando o
 * navegador bloqueia o IndexedDB, ex.: navegação privada restrita).
 */
export interface SaveStore {
  readonly persistent: boolean;
  get(key: string): Promise<string | null>;
  /** Grava várias chaves de uma vez: ou grava todas, ou nenhuma. */
  putAll(entries: Readonly<Record<string, string>>): Promise<void>;
  delete(keys: readonly string[]): Promise<void>;
}

export class MemorySaveStore implements SaveStore {
  readonly persistent = false;
  readonly data = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.data.get(key) ?? null;
  }

  async putAll(entries: Readonly<Record<string, string>>): Promise<void> {
    for (const [k, v] of Object.entries(entries)) this.data.set(k, v);
  }

  async delete(keys: readonly string[]): Promise<void> {
    for (const k of keys) this.data.delete(k);
  }
}

const DB_NAME = 'simulador-mecanico';
const STORE = 'saves';

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export class IndexedDbSaveStore implements SaveStore {
  readonly persistent = true;
  private dbPromise: Promise<IDBDatabase> | null = null;

  static available(): boolean {
    try {
      return typeof indexedDB !== 'undefined' && indexedDB !== null;
    } catch {
      return false;
    }
  }

  async get(key: string): Promise<string | null> {
    const db = await this.db();
    const value = await request(db.transaction(STORE, 'readonly').objectStore(STORE).get(key));
    return typeof value === 'string' ? value : null;
  }

  async putAll(entries: Readonly<Record<string, string>>): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    for (const [k, v] of Object.entries(entries)) store.put(v, k);
    await this.done(tx);
  }

  async delete(keys: readonly string[]): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(STORE, 'readwrite');
    for (const k of keys) tx.objectStore(STORE).delete(k);
    await this.done(tx);
  }

  private done(tx: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('transação cancelada'));
    });
  }

  private db(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const open = indexedDB.open(DB_NAME, 1);
        open.onupgradeneeded = () => {
          if (!open.result.objectStoreNames.contains(STORE)) open.result.createObjectStore(STORE);
        };
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
        open.onblocked = () => reject(new Error('banco de saves bloqueado por outra aba'));
      });
      this.dbPromise.catch(() => (this.dbPromise = null));
    }
    return this.dbPromise;
  }
}
