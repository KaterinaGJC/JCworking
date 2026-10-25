// 备份文件的结构、校验与合并（纯函数，无 DB / DOM 依赖）
import { pad2 } from './dates.js';

export const APP_ID = 'jc-life';
export const SCHEMA_VERSION = 1;

export const DATA_STORES = [
  'tasks', 'lessons', 'students', 'notes',
  'games', 'activities', 'shows', 'experiences',
  'blobs', // 图片：导出/导入/快照都要带上，否则换机后图片全丢
];

export const DEFAULT_SETTINGS = { theme: 'auto', weekStart: 1 };

export function buildBackup({ data = {}, settings = DEFAULT_SETTINGS, now = new Date() } = {}) {
  const out = {};
  for (const s of DATA_STORES) out[s] = Array.isArray(data[s]) ? data[s] : [];
  return {
    app: APP_ID,
    version: SCHEMA_VERSION,
    exportedAt: `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}T${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`,
    data: out,
    settings: { ...DEFAULT_SETTINGS, ...(settings || {}) },
  };
}

/** 校验导入文件；任何一项不合格都返回 ok:false，调用方不得改动现有数据 */
export function validateBackup(obj) {
  if (!obj || typeof obj !== 'object') return { ok: false, error: '不是有效的备份文件' };
  if (obj.app !== APP_ID) return { ok: false, error: '这个文件不是本应用的备份' };
  if (typeof obj.version !== 'number') return { ok: false, error: '备份文件缺少版本号' };
  if (obj.version > SCHEMA_VERSION) return { ok: false, error: '备份来自更新版本，请先升级应用' };
  if (!obj.data || typeof obj.data !== 'object') return { ok: false, error: '备份文件里没有数据' };
  for (const s of DATA_STORES) {
    if (obj.data[s] === undefined) continue;
    if (!Array.isArray(obj.data[s])) return { ok: false, error: `数据段 ${s} 格式不正确` };
    for (const rec of obj.data[s]) {
      if (!rec || typeof rec !== 'object') return { ok: false, error: `数据段 ${s} 里有损坏的条目` };
      if (!rec.id) return { ok: false, error: `数据段 ${s} 里有条目缺少 id` };
    }
  }
  const settings = obj.settings && typeof obj.settings === 'object' ? obj.settings : {};
  if (settings.theme && !['light', 'dark', 'auto'].includes(settings.theme)) {
    return { ok: false, error: '设置里的主题值不正确' };
  }
  if (settings.weekStart !== undefined && ![1, 7].includes(settings.weekStart)) {
    return { ok: false, error: '设置里的一周起始日不正确' };
  }
  return { ok: true, data: obj.data, settings: { ...DEFAULT_SETTINGS, ...settings } };
}

const ts = (rec) => Number(rec.updatedAt ?? rec.createdAt ?? rec.doneAt ?? 0) || 0;

/**
 * 合并：按 id 去重，同一条保留 updatedAt 更新的一份。
 * 只保留在 both 中出现的 id 并集。
 */
export function mergeRecords(current = [], incoming = []) {
  const map = new Map();
  for (const r of current) map.set(r.id, r);
  for (const r of incoming) {
    const old = map.get(r.id);
    if (!old) { map.set(r.id, r); continue; }
    if (ts(r) >= ts(old)) map.set(r.id, r);
  }
  return [...map.values()];
}

export function mergeAll(currentData = {}, incomingData = {}) {
  const out = {};
  for (const s of DATA_STORES) {
    out[s] = mergeRecords(currentData[s] ?? [], incomingData[s] ?? []);
  }
  return out;
}

export function backupFileName(now = new Date()) {
  return `景臣备份-${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}-${pad2(now.getHours())}${pad2(now.getMinutes())}.json`;
}
