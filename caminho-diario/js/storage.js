import { APP_KEY, DB_NAME, DB_VERSION, GUEST_SCOPE, MIGRATION_OWNER_KEY, RECORD_KINDS, createDefaultState } from './constants.js';
import { operationKey } from './sync-engine.js';
import { normalizeRecord, validateBackup } from './validation.js';
import { nowIso } from './utils.js';

let databasePromise;

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error('Transação IndexedDB cancelada.'));
  });
}

export function openStorage() {
  if (!('indexedDB' in globalThis)) return Promise.reject(new Error('IndexedDB indisponível neste navegador.'));
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('records')) {
        const records = db.createObjectStore('records', { keyPath: 'key' });
        records.createIndex('scope', 'scope', { unique: false });
        records.createIndex('scopeKind', ['scope', 'kind'], { unique: false });
      }
      if (!db.objectStoreNames.contains('outbox')) {
        const outbox = db.createObjectStore('outbox', { keyPath: 'key' });
        outbox.createIndex('scope', 'scope', { unique: false });
      }
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return databasePromise;
}

export async function get(scope, kind, id) {
  const db = await openStorage();
  const transaction = db.transaction('records', 'readonly');
  const row = await requestResult(transaction.objectStore('records').get(operationKey(scope, kind, id)));
  return row?.payload || null;
}

export async function list(scope, kind = null) {
  const db = await openStorage();
  const transaction = db.transaction('records', 'readonly');
  const index = transaction.objectStore('records').index(kind ? 'scopeKind' : 'scope');
  const query = kind ? IDBKeyRange.only([scope, kind]) : IDBKeyRange.only(scope);
  const rows = await requestResult(index.getAll(query));
  return rows.map(row => ({ kind: row.kind, id: row.id, payload: row.payload, syncedRevision: row.syncedRevision || null }));
}

export async function set(scope, kind, id, payload, { enqueue = true } = {}) {
  const normalized = normalizeRecord(kind, id, payload);
  const db = await openStorage();
  const stores = enqueue ? ['records', 'outbox'] : ['records'];
  const transaction = db.transaction(stores, 'readwrite');
  const key = operationKey(scope, kind, id);
  transaction.objectStore('records').put({ key, scope, kind, id, payload: normalized, syncedRevision: enqueue ? null : normalized.updatedAt });
  if (enqueue) transaction.objectStore('outbox').put({ key, scope, kind, id, type: 'upsert', payload: normalized, revision: normalized.updatedAt, attempts: 0, queuedAt: nowIso() });
  await transactionDone(transaction);
  return normalized;
}

export async function remove(scope, kind, id, { enqueue = true } = {}) {
  const db = await openStorage();
  const stores = enqueue ? ['records', 'outbox'] : ['records'];
  const transaction = db.transaction(stores, 'readwrite');
  const key = operationKey(scope, kind, id);
  transaction.objectStore('records').delete(key);
  if (enqueue) transaction.objectStore('outbox').put({ key, scope, kind, id, type: 'delete', revision: nowIso(), attempts: 0, queuedAt: nowIso() });
  await transactionDone(transaction);
}

export async function enqueueSync(scope, kind, id, type, payload = null) {
  const db = await openStorage();
  const transaction = db.transaction('outbox', 'readwrite');
  const key = operationKey(scope, kind, id);
  const normalized = type === 'upsert' ? normalizeRecord(kind, id, payload) : null;
  transaction.objectStore('outbox').put({ key, scope, kind, id, type, payload: normalized, revision: normalized?.updatedAt || nowIso(), attempts: 0, queuedAt: nowIso() });
  await transactionDone(transaction);
}

export async function listSync(scope) {
  const db = await openStorage();
  const transaction = db.transaction('outbox', 'readonly');
  const rows = await requestResult(transaction.objectStore('outbox').index('scope').getAll(IDBKeyRange.only(scope)));
  return rows.sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
}

export async function getPending(scope, kind, id) {
  const db = await openStorage();
  const transaction = db.transaction('outbox', 'readonly');
  return requestResult(transaction.objectStore('outbox').get(operationKey(scope, kind, id)));
}

export async function markSynced(key, revision) {
  const db = await openStorage();
  const transaction = db.transaction(['outbox', 'records'], 'readwrite');
  const store = transaction.objectStore('outbox');
  const current = await requestResult(store.get(key));
  if (current?.revision === revision) {
    if (current.type === 'upsert') {
      const records = transaction.objectStore('records');
      const row = await requestResult(records.get(key));
      if (row?.payload?.updatedAt === revision) records.put({ ...row, syncedRevision: revision });
    }
    store.delete(key);
  }
  await transactionDone(transaction);
}

export async function markAttempt(key, attempts, errorMessage) {
  const db = await openStorage();
  const transaction = db.transaction('outbox', 'readwrite');
  const store = transaction.objectStore('outbox');
  const current = await requestResult(store.get(key));
  if (current) store.put({ ...current, attempts, lastError: String(errorMessage || '').slice(0, 500), lastAttemptAt: nowIso() });
  await transactionDone(transaction);
}

export const markDeleted = (scope, kind, id) => remove(scope, kind, id, { enqueue: true });

async function metaGet(key) {
  const db = await openStorage();
  const transaction = db.transaction('meta', 'readonly');
  return requestResult(transaction.objectStore('meta').get(key));
}

async function metaSet(key, value) {
  const db = await openStorage();
  const transaction = db.transaction('meta', 'readwrite');
  transaction.objectStore('meta').put({ key, value });
  await transactionDone(transaction);
}

export async function migrateLegacyStorage(storageKey = APP_KEY, scope = GUEST_SCOPE) {
  const marker = `legacy-migrated:${storageKey}`;
  if ((await metaGet(marker))?.value) return false;
  const raw = localStorage.getItem(storageKey);
  if (!raw) {
    await metaSet(marker, true);
    return false;
  }
  const state = validateBackup(JSON.parse(raw));
  await set(scope, RECORD_KINDS.SETTINGS, 'profile', state.settings);
  for (const [id, payload] of Object.entries(state.days)) await set(scope, RECORD_KINDS.DAY, id, payload);
  for (const payload of state.prayers) await set(scope, RECORD_KINDS.PRAYER, payload.id, payload);
  for (const [id, payload] of Object.entries(state.weeks)) await set(scope, RECORD_KINDS.WEEK, id, payload);
  const legacy = JSON.parse(raw);
  for (const item of Array.isArray(legacy.deletions) ? legacy.deletions : []) {
    if (item?.kind && item?.id) await enqueueSync(scope, item.kind, item.id, 'delete');
  }
  await metaSet(marker, true);
  return true;
}

export async function claimGuestData(userId) {
  const owner = (await metaGet(MIGRATION_OWNER_KEY))?.value || localStorage.getItem(MIGRATION_OWNER_KEY);
  if (owner || !(await list(GUEST_SCOPE)).length) return false;
  const records = await list(GUEST_SCOPE);
  for (const row of records) {
    await set(userId, row.kind, row.id, row.payload);
    await remove(GUEST_SCOPE, row.kind, row.id, { enqueue: false });
  }
  await metaSet(MIGRATION_OWNER_KEY, userId);
  localStorage.setItem(MIGRATION_OWNER_KEY, userId);
  return true;
}

export async function loadState(scope) {
  const state = createDefaultState();
  for (const row of await list(scope)) {
    if (row.kind === RECORD_KINDS.DAY) state.days[row.id] = row.payload;
    if (row.kind === RECORD_KINDS.PRAYER) state.prayers.push(row.payload);
    if (row.kind === RECORD_KINDS.WEEK) state.weeks[row.id] = row.payload;
    if (row.kind === RECORD_KINDS.SETTINGS && row.id === 'profile') state.settings = row.payload;
  }
  state.prayers.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return state;
}

export async function replaceScope(scope, nextState) {
  const normalized = validateBackup(nextState);
  const db = await openStorage();
  const transaction = db.transaction(['records', 'outbox'], 'readwrite');
  const records = transaction.objectStore('records');
  const outbox = transaction.objectStore('outbox');
  const existing = await requestResult(records.index('scope').getAll(IDBKeyRange.only(scope)));
  existing.forEach(row => { records.delete(row.key); outbox.delete(row.key); });
  await transactionDone(transaction);
  await set(scope, RECORD_KINDS.SETTINGS, 'profile', normalized.settings);
  for (const [id, payload] of Object.entries(normalized.days)) await set(scope, RECORD_KINDS.DAY, id, payload);
  for (const payload of normalized.prayers) await set(scope, RECORD_KINDS.PRAYER, payload.id, payload);
  for (const [id, payload] of Object.entries(normalized.weeks)) await set(scope, RECORD_KINDS.WEEK, id, payload);
  return normalized;
}

export async function clearScope(scope) {
  const db = await openStorage();
  const transaction = db.transaction(['records', 'outbox'], 'readwrite');
  const records = transaction.objectStore('records');
  const outbox = transaction.objectStore('outbox');
  const [recordRows, operationRows] = await Promise.all([
    requestResult(records.index('scope').getAll(IDBKeyRange.only(scope))),
    requestResult(outbox.index('scope').getAll(IDBKeyRange.only(scope)))
  ]);
  recordRows.forEach(row => records.delete(row.key));
  operationRows.forEach(row => outbox.delete(row.key));
  await transactionDone(transaction);
}

export async function mergeScope(scope, nextState) {
  const incoming = validateBackup(nextState);
  const current = await loadState(scope);
  const merged = {
    settings: incoming.settings.updatedAt >= (current.settings.updatedAt || '') ? incoming.settings : current.settings,
    days: { ...current.days },
    prayers: [],
    weeks: { ...current.weeks }
  };
  Object.entries(incoming.days).forEach(([id, item]) => {
    if (!merged.days[id] || item.updatedAt >= merged.days[id].updatedAt) merged.days[id] = item;
  });
  Object.entries(incoming.weeks).forEach(([id, item]) => {
    if (!merged.weeks[id] || item.updatedAt >= merged.weeks[id].updatedAt) merged.weeks[id] = item;
  });
  const prayers = new Map(current.prayers.map(item => [item.id, item]));
  incoming.prayers.forEach(item => {
    if (!prayers.has(item.id) || item.updatedAt >= prayers.get(item.id).updatedAt) prayers.set(item.id, item);
  });
  merged.prayers = [...prayers.values()];
  return replaceScope(scope, merged);
}
