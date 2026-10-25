// 纯日期工具（无 DOM 依赖，可被 Node 单元测试直接导入）
export const WEEK_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
export const WEEK_SHORT = ['日', '一', '二', '三', '四', '五', '六'];

export const pad2 = (n) => String(n).padStart(2, '0');

export function ymd(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function todayStr(now = new Date()) {
  return ymd(now);
}

export function parseYmd(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDays(s, n) {
  const d = parseYmd(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
}

/** 0=周日 … 6=周六 */
export function weekday(s) {
  return parseYmd(s).getDay();
}

/** ISO 序：周一=1 … 周日=7 */
export function weekdayIndex1(s) {
  const w = weekday(s);
  return w === 0 ? 7 : w;
}

export function weekdayCN(s) {
  return WEEK_CN[weekday(s)];
}

/** weekStart: 1=周一, 7=周日 */
export function startOfWeek(s, weekStart = 1) {
  const cur = weekdayIndex1(s);
  const delta = (cur - weekStart + 7) % 7;
  return addDays(s, -delta);
}

export function weekDates(s, weekStart = 1) {
  const st = startOfWeek(s, weekStart);
  return Array.from({ length: 7 }, (_, i) => addDays(st, i));
}

/** a - b，单位天 */
export function diffDays(a, b) {
  const da = parseYmd(a);
  const db = parseYmd(b);
  return Math.round((da.getTime() - db.getTime()) / 86400000);
}

export function fmtMD(s) {
  const d = parseYmd(s);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function fmtDateCN(s) {
  const d = parseYmd(s);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export function fmtFullCN(s) {
  return `${fmtDateCN(s)} ${weekdayCN(s)}`;
}

/** 月历网格：返回 6 行 × 7 列，元素为 { date, inMonth } */
export function monthMatrix(year, month /* 1-12 */, weekStart = 1) {
  const first = new Date(year, month - 1, 1);
  const cur = weekdayIndex1(ymd(first));
  const lead = (cur - weekStart + 7) % 7;
  const start = new Date(year, month - 1, 1 - lead);
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    cells.push({ date: ymd(d), inMonth: d.getMonth() === month - 1, day: d.getDate() });
  }
  return cells;
}

export function minutesOf(hm) {
  if (!hm) return null;
  const [h, m] = String(hm).split(':').map(Number);
  if (Number.isNaN(h)) return null;
  return h * 60 + (m || 0);
}

export function hmFromMinutes(min) {
  const m = Math.max(0, Math.round(min));
  return `${pad2(Math.floor(m / 60) % 24)}:${pad2(m % 60)}`;
}

export function endTimeHM(start, durationMin) {
  const s = minutesOf(start);
  if (s === null) return '';
  return hmFromMinutes(s + (durationMin || 0));
}

export function nowHM(now = new Date()) {
  return `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
}

export function relativeCN(ts, now = Date.now()) {
  const diff = Math.max(0, now - ts);
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d === 1) return '昨天';
  if (d < 7) return `${d} 天前`;
  const dt = new Date(ts);
  return `${dt.getMonth() + 1}/${dt.getDate()}`;
}

/**
 * 精确到秒的完整时间戳：`2026年10月25日 周六 14:30:05`（本地时区，不做 UTC 转换）
 * ts 非法时返回空串——不编造时间，宁可空着也不显示一个假的时间点。
 * 注意：Number(null) 是 0，会被当成 1970-01-01，所以先显式挡掉 null / '' / undefined。
 */
export function fullStampCN(ts) {
  if (ts === null || ts === undefined || ts === '') return '';
  const n = Number(ts);
  if (!Number.isFinite(n)) return '';
  const d = new Date(n);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${WEEK_CN[d.getDay()]} `
    + `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

export function daysLeftCN(dueStr, today = todayStr()) {
  const n = diffDays(dueStr, today);
  if (n < 0) return { text: '已结束', cls: 'over' };
  if (n === 0) return { text: '今天截止', cls: 'urgent' };
  if (n === 1) return { text: '还剩 1 天', cls: 'urgent' };
  return { text: `还剩 ${n} 天`, cls: n <= 3 ? '' : '' };
}
