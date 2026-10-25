// 内存状态 + 变更通知；所有页面读这里，写操作先落库再更新内存
import * as db from './db.js';
import { DEFAULT_SETTINGS } from './core/backup.js';

export const state = {
  tasks: [],
  lessons: [],
  students: [],
  notes: [],
  games: [],
  activities: [],
  shows: [],
  experiences: [],
  blobs: [],
  meta: {},
  settings: { ...DEFAULT_SETTINGS },
  loaded: false,
};

const listeners = new Map();

export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
  return () => listeners.get(event)?.delete(fn);
}

export function emit(event, payload) {
  for (const fn of listeners.get(event) ?? []) {
    try { fn(payload); } catch (e) { console.error('[store]', event, e); }
  }
}

export async function loadAll() {
  for (const name of db.DATA_STORES) {
    state[name] = await db.getAll(name);
  }
  const metaRows = await db.getAll('meta');
  state.meta = {};
  for (const row of metaRows) state.meta[row.key] = row.value;
  state.settings = { ...DEFAULT_SETTINGS, ...(state.meta.settings || {}) };
  state.loaded = true;
  emit('loaded');
  return state;
}

export function getMeta(key, fallback = null) {
  return state.meta[key] ?? fallback;
}

export async function setMeta(key, value) {
  state.meta[key] = value;
  await db.put('meta', { key, value });
  emit('meta', { key, value });
}

export async function saveSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  await setMeta('settings', state.settings);
  return state.settings;
}

function touch(rec) {
  const now = Date.now();
  return { ...rec, updatedAt: now, createdAt: rec.createdAt ?? now };
}

/** 新增或更新一条记录（kind = 表名） */
export async function saveRecord(kind, rec) {
  const next = touch(rec);
  await db.put(kind, next);
  const list = state[kind];
  const i = list.findIndex((r) => r.id === next.id);
  if (i >= 0) list[i] = next; else list.push(next);
  emit(`change:${kind}`, next);
  emit('change', { kind, rec: next });
  return next;
}

export async function saveMany(kind, recs) {
  const next = recs.map(touch);
  await db.putMany(kind, next);
  const list = state[kind];
  for (const rec of next) {
    const i = list.findIndex((r) => r.id === rec.id);
    if (i >= 0) list[i] = rec; else list.push(rec);
  }
  emit(`change:${kind}`, next);
  emit('change', { kind, recs: next });
  return next;
}

export async function removeRecord(kind, id) {
  await db.remove(kind, id);
  state[kind] = state[kind].filter((r) => r.id !== id);
  emit(`change:${kind}`, { id, removed: true });
  emit('change', { kind, id, removed: true });
}

export function byKind(kind) {
  return state[kind] ?? [];
}

export function replaceAll(kind, rows) {
  state[kind] = rows;
  emit(`change:${kind}`, rows);
  emit('change', { kind, rows });
}
