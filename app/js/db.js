// IndexedDB 封装：无第三方库，全部 Promise 化
export const DB_NAME = 'jc-life';
export const DB_VERSION = 4;

export const DATA_STORES = [
  'tasks', 'lessons', 'students', 'notes',
  'games', 'activities', 'shows', 'experiences',
  'posts', // v4：记录板块（博客式时间线；评论内嵌在 posts[].comments，配图走 blobs）
  'blobs', // v3：图片（便签插图、课次图片、背景底图、记录配图），存压缩后的 dataURL
];

export const ALL_STORES = [...DATA_STORES, 'meta', 'snapshots'];

function upgradeSchema(db, tx) {
  const store = (name, opts) => (db.objectStoreNames.contains(name) ? tx.objectStore(name) : db.createObjectStore(name, opts));
  const index = (os, name, keyPath, opts = {}) => {
    if (!os.indexNames.contains(name)) os.createIndex(name, keyPath, opts);
  };

  for (const name of DATA_STORES) index(store(name, { keyPath: 'id' }), 'byId', 'id');

  index(store('tasks', { keyPath: 'id' }), 'byDate', 'date');
  index(store('lessons', { keyPath: 'id' }), 'byDate', 'date');
  index(store('activities', { keyPath: 'id' }), 'byDue', 'due');
  index(store('experiences', { keyPath: 'id' }), 'byDate', 'date');
  index(store('notes', { keyPath: 'id' }), 'byUpdated', 'updatedAt');
  index(store('shows', { keyPath: 'id' }), 'byWeekday', 'weekday');
  index(store('students', { keyPath: 'id' }), 'byName', 'name');
  store('meta', { keyPath: 'key' });
  store('snapshots', { keyPath: 'day' });
}

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => upgradeSchema(req.result, req.transaction);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('数据库被其他标签页占用，请关闭后重试'));
  });
  return dbPromise;
}

async function readAll(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function writeOne(storeName, record, op) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    op(tx.objectStore(storeName));
    tx.oncomplete = () => resolve(record);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('写入被中止'));
  });
}

export const getAll = (store) => readAll(store);

export async function getOne(store, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

export const put = (store, record) => writeOne(store, record, (s) => s.put(record));

export function putMany(store, records) {
  if (!records?.length) return Promise.resolve();
  return writeOne(store, records, (s) => { for (const r of records) s.put(r); });
}

export const remove = (store, key) => writeOne(store, key, (s) => s.delete(key));

export const clearStore = (store) => writeOne(store, null, (s) => s.clear());

export async function count(store) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** 一次性读多个表，用于导出/快照 */
export async function dumpStores(storeNames = DATA_STORES) {
  const out = {};
  for (const name of storeNames) out[name] = await readAll(name);
  return out;
}

/** 一次性清空所有数据表（meta 与 snapshots 由调用方决定） */
export async function clearMany(storeNames) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, 'readwrite');
    for (const name of storeNames) tx.objectStore(name).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
