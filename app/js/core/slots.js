// 课表节次（时间段）：默认一套中学样式的节次，可被用户在设置里改写
import { minutesOf } from './dates.js';

export const DEFAULT_SLOTS = [
  { id: 'slot-1', label: '第1节', start: '08:00', end: '08:45' },
  { id: 'slot-2', label: '第2节', start: '08:55', end: '09:40' },
  { id: 'slot-3', label: '第3节', start: '10:00', end: '10:45' },
  { id: 'slot-4', label: '第4节', start: '10:55', end: '11:40' },
  { id: 'slot-5', label: '第5节', start: '14:00', end: '14:45' },
  { id: 'slot-6', label: '第6节', start: '14:55', end: '15:40' },
  { id: 'slot-7', label: '第7节', start: '16:00', end: '16:45' },
  { id: 'slot-8', label: '第8节', start: '19:00', end: '19:45' },
];

export function getSlots(settings = {}) {
  const list = Array.isArray(settings.timeSlots) ? settings.timeSlots : null;
  if (!list || !list.length) return DEFAULT_SLOTS.map((s) => ({ ...s }));
  return list
    .filter((s) => s && s.start)
    .map((s, i) => ({
      id: s.id || `slot-${i + 1}`,
      label: s.label || `第${i + 1}节`,
      start: s.start,
      end: s.end || s.start,
    }))
    .sort((a, b) => (minutesOf(a.start) ?? 0) - (minutesOf(b.start) ?? 0));
}

export function slotById(slots, id) {
  return slots.find((s) => s.id === id) || null;
}

/**
 * 把一节课落到某个节次上：
 * 1) 有 slotId 且该节次还在 → 用它
 * 2) 否则按开始时间：先找完全相等，再找被节次区间覆盖的
 * 3) 都落不上 → null（显示在网格下方的"其它时间"）
 */
export function slotForLesson(slots, lesson) {
  if (!lesson) return null;
  if (lesson.slotId) {
    const hit = slotById(slots, lesson.slotId);
    if (hit) return hit;
  }
  const start = minutesOf(lesson.start);
  if (start === null) return null;
  const exact = slots.find((s) => minutesOf(s.start) === start);
  if (exact) return exact;
  const inside = slots.find((s) => {
    const a = minutesOf(s.start);
    const b = minutesOf(s.end);
    return a !== null && b !== null && start >= a && start < b;
  });
  return inside || null;
}

export function slotDuration(slot, fallback = 90) {
  if (!slot) return fallback;
  const a = minutesOf(slot.start);
  const b = minutesOf(slot.end);
  if (a === null || b === null || b <= a) return fallback;
  return b - a;
}

/** 生成一个新的节次（接在最后一个后面，时间顺延一小时） */
export function makeSlot(slots) {
  const last = slots[slots.length - 1];
  const base = last ? minutesOf(last.start) : 8 * 60;
  const startMin = (base ?? 8 * 60) + 60;
  const pad = (n) => String(n).padStart(2, '0');
  const hm = (m) => `${pad(Math.floor((m % 1440) / 60))}:${pad(m % 60)}`;
  return {
    id: `slot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    label: `第${slots.length + 1}节`,
    start: hm(startMin),
    end: hm(startMin + 45),
  };
}
