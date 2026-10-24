import { diffDays, weekdayIndex1 } from './dates.js';

export const REPEAT_NONE = 'none';

export function normalizeRepeat(rule) {
  if (!rule || !rule.type || rule.type === REPEAT_NONE) return { type: 'none', weekdays: [] };
  if (rule.type === 'daily') return { type: 'daily', weekdays: [] };
  if (rule.type === 'weekly') {
    const wd = Array.from(new Set((rule.weekdays || []).map(Number).filter((n) => n >= 1 && n <= 7)));
    wd.sort((a, b) => a - b);
    // 没有有效星期 → 永远不会命中，退化成不重复
    if (!wd.length) return { type: 'none', weekdays: [] };
    return { type: 'weekly', weekdays: wd };
  }
  return { type: 'none', weekdays: [] };
}

/** 规则是否命中某一天（不看起始日） */
export function matchesRepeat(rule, dateStr) {
  const r = normalizeRepeat(rule);
  if (r.type === 'none') return false;
  if (r.type === 'daily') return true;
  if (r.type === 'weekly') return r.weekdays.includes(weekdayIndex1(dateStr));
  return false;
}

/**
 * 是否应为某天生成一条重复实例：
 * 1) 规则命中该天
 * 2) 该天不早于模板起始日
 */
export function shouldGenerate(rule, templateDate, dateStr) {
  if (!matchesRepeat(rule, dateStr)) return false;
  return diffDays(dateStr, templateDate) >= 0;
}

/** 重复规则的中文描述 */
export function repeatLabel(rule) {
  const r = normalizeRepeat(rule);
  if (r.type === 'none') return '';
  if (r.type === 'daily') return '每天';
  const names = ['', '一', '二', '三', '四', '五', '六', '日'];
  return '每周' + r.weekdays.map((n) => names[n]).join('、');
}
