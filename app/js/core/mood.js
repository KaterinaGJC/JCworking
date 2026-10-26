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

/** 最近 N 天的心情（只返回记过的） */
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

/**
 * 统计某个范围内每种心情各几天（给"本月心情"小结用）
 * @returns {{id:string,label:string,color:string,days:number}[]}
 */
export function moodStats(fromDate, toDate) {
  const count = {};
  const start = new Date(`${fromDate}T00:00:00`);
  const end = new Date(`${toDate}T00:00:00`);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const m = store.getMeta(moodKey(key), null);
    if (m?.id) count[m.id] = (count[m.id] || 0) + 1;
  }
  return MOODS.map((m) => ({
    id: m.id, label: m.label, color: MOOD_COLORS[m.id], days: count[m.id] || 0,
  }));
}

/** 每种心情的圆点颜色（与首页心情圈同源，深色模式下也够用） */
export const MOOD_COLORS = {
  happy: '#F7DCB2',
  sad: '#CBE0F4',
  angry: '#F4C8C6',
  calm: '#CBE4CD',
  tired: '#D9D0EA',
};

/** 某月里每天的心情（key = YYYY-MM-DD），给月历打点用 */
export function moodMapOfMonth(year, month /* 1-12 */) {
  const map = {};
  const last = new Date(year, month, 0).getDate();
  for (let day = 1; day <= last; day += 1) {
    const key = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const m = store.getMeta(moodKey(key), null);
    if (m?.id) map[key] = m.id;
  }
  return map;
}

/**
 * 最近 N 天（含没记的），从旧到新，给"心情历史条"用。
 * @returns {{date:string, label:string, moodId:string|null, today:boolean}[]}
 */
export function moodWeek(days = 7) {
  const out = [];
  const base = new Date();
  const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
  const todayKey = todayStr();
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(base);
    d.setDate(base.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const m = store.getMeta(moodKey(key), null);
    out.push({
      date: key,
      label: i === 0 ? '今' : WEEK[d.getDay()],
      moodId: m?.id || null,
      today: key === todayKey,
    });
  }
  return out;
}
