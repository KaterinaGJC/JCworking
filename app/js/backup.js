// 快照 / 导出 / 导入 / 清空
import * as db from './db.js';
import * as store from './store.js';
import {
  buildBackup, validateBackup, mergeAll, backupFileName,
  DATA_STORES, DEFAULT_SETTINGS,
} from './core/backup.js';
import { download, pickFile, todayStr, pad2 } from './util.js';

export const SNAPSHOT_KEEP = 7;

async function snapshotData() {
  return db.dumpStores(DATA_STORES);
}

/** 生成一份当日快照（同一天只生成一次，除非 force） */
export async function makeSnapshot({ force = false } = {}) {
  const day = todayStr();
  if (!force && store.getMeta('lastSnapshotDay') === day) return null;
  const data = await snapshotData();
  const payload = buildBackup({ data, settings: store.state.settings });
  await db.put('snapshots', { day, createdAt: Date.now(), payload });
  await store.setMeta('lastSnapshotDay', day);
  await pruneSnapshots(SNAPSHOT_KEEP);
  return day;
}

export async function pruneSnapshots(keep = SNAPSHOT_KEEP) {
  const all = await db.getAll('snapshots');
  const sorted = all.sort((a, b) => (a.day < b.day ? 1 : -1));
  const drop = sorted.slice(keep);
  for (const s of drop) await db.remove('snapshots', s.day);
  return drop.length;
}

export async function listSnapshots() {
  const all = await db.getAll('snapshots');
  return all.sort((a, b) => (a.day < b.day ? 1 : -1));
}

export async function exportBackup() {
  const data = await snapshotData();
  const payload = buildBackup({ data, settings: store.state.settings });
  const text = JSON.stringify(payload, null, 2);
  download(backupFileName(), text);
  await store.setMeta('lastBackupAt', Date.now());
  return payload;
}

/** 只解析与校验，不改数据 */
export async function readBackupFile(file) {
  let text;
  try {
    text = await file.text();
  } catch {
    return { ok: false, error: '这个文件读不了' };
  }
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    return { ok: false, error: '这个文件不是有效的备份（内容不是 JSON）' };
  }
  return validateBackup(obj);
}

/** 用一份已经校验过的数据整体替换本地数据 */
async function replaceWith(data, settings) {
  await db.clearMany(DATA_STORES);
  for (const s of DATA_STORES) {
    const rows = data[s] ?? [];
    if (rows.length) await db.putMany(s, rows);
  }
  await store.loadAll();
  if (settings) {
    await store.saveSettings({ ...DEFAULT_SETTINGS, ...settings });
  }
}

/** 导入：mode = 'overwrite' | 'merge' */
export async function applyBackup(validated, mode = 'overwrite') {
  await makeSnapshot({ force: true }); // 导入前先留底，误导入可回退

  if (mode === 'merge') {
    const merged = mergeAll(await snapshotData(), validated.data);
    await replaceWith(merged, validated.settings);
  } else {
    await replaceWith(validated.data, validated.settings);
  }
  return true;
}

export async function restoreSnapshot(day) {
  const row = await db.getOne('snapshots', day);
  if (!row?.payload) return { ok: false, error: '这份快照不存在' };
  const check = validateBackup(row.payload);
  if (!check.ok) return check;
  await makeSnapshot({ force: true }); // 恢复前的状态也留一份（会被下一次覆盖，但至少同一天内可回退）
  await replaceWith(check.data, check.settings);
  return { ok: true };
}

export async function clearAll() {
  await db.clearMany([...DATA_STORES, 'snapshots', 'meta']);
  for (const s of DATA_STORES) store.replaceAll(s, []);
  store.state.meta = {};
  store.state.settings = { ...DEFAULT_SETTINGS };
  await db.put('meta', { key: 'settings', value: store.state.settings });
  store.emit('change', { kind: 'meta', cleared: true });
}

/** 启动时调用：每天第一次打开留一份快照 */
export async function maybeDailySnapshot() {
  return makeSnapshot();
}

/** 从文件名/日期生成可读标签 */
export function snapshotLabel(day) {
  const [y, m, d] = day.split('-');
  void y;
  return `${m}月${d}日`;
}

export function stampCN(ts) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export { pickFile, download };
