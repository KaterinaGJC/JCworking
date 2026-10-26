// 蓝调心情记录：每天挑一个心情 + 一句手写话。
//
// 存储：复用 meta 表（key = `mood:YYYY-MM-DD`），**不新增数据表、不升 DB 版本**——
// 心情是"轻数据"，不值得为它做一次数据库迁移（迁移就有丢数据的风险）。
// 备份/合并天然带上它（meta 已在备份范围内）。

import * as store from '../store.js';
import { todayStr } from '../util.js';

export const MOODS = [
  { id: 'happy', label: '开心', phrase: 'a little blue today' },
  { id: 'sad', label: '难过', phrase: '天有点阴，慢慢来' },
  { id: 'angry', label: '生气', phrase: '深呼吸三次再说话' },
  { id: 'calm', label: '平静', phrase: '今天过得很稳' },
  { id: 'tired', label: '累', phrase: '早点睡，明天再算' },
];

export const moodKey = (date) => `mood:${date}`;

/** 读某天的心情；没记过返回 null */
export function getMood(date = todayStr()) {
  const v = store.getMeta(moodKey(date), null);
  if (!v || !v.id) return null;
  return v;
}

/** 记某天的心情；note 为空时用该心情的默认句子 */
export async function setMood(date, id, note = '') {
  const m = MOODS.find((x) => x.id === id);
  if (!m) return null;
  const rec = { id, note: (note || '').trim() || m.phrase, at: Date.now() };
  await store.setMeta(moodKey(date), rec);
  return rec;
}

/** 一句话展示：优先用户写的，其次心情自带的 */
export function moodLine(mood) {
  if (!mood) return '今天心情如何？点一个圈圈';
  const m = MOODS.find((x) => x.id === mood.id);
  return mood.note || m?.phrase || '';
}

/** 最近 N 天的心情（给"本周心情"用，暂时只用于无障碍文案） */
export function recentMoods(days = 7) {
  const out = [];
  const base = new Date();
  for (let i = 0; i < days; i += 1) {
    const d = new Date(base);
    d.setDate(base.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const m = store.getMeta(moodKey(key), null);
    if (m?.id) out.push({ date: key, ...m });
  }
  return out;
}
