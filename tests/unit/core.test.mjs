import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addDays, diffDays, startOfWeek, weekDates, weekdayIndex1, weekdayCN,
  monthMatrix, ymd, parseYmd, endTimeHM, hmFromMinutes, minutesOf, todayStr, fmtFullCN,
  fullStampCN,
} from '../../app/js/core/dates.js';
import { shouldGenerate, matchesRepeat, normalizeRepeat, repeatLabel } from '../../app/js/core/repeat.js';
import { buildSummary } from '../../app/js/core/summary.js';
import {
  buildBackup, validateBackup, mergeRecords, mergeAll, backupFileName,
  DATA_STORES, SCHEMA_VERSION,
} from '../../app/js/core/backup.js';

/* ---------------- 日期 ---------------- */
test('日期：加减与差值', () => {
  assert.equal(addDays('2026-10-24', 1), '2026-10-25');
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(diffDays('2026-11-01', '2026-10-31'), 1);
  assert.equal(diffDays('2026-10-01', '2026-10-31'), -30);
});

test('日期：周起始（周一/周日两种设置）', () => {
  // 2026-10-24 是周六
  assert.equal(weekdayCN('2026-10-24'), '周六');
  assert.equal(weekdayIndex1('2026-10-25'), 7); // 周日 = 7
  assert.equal(startOfWeek('2026-10-24', 1), '2026-10-19'); // 周一
  assert.equal(startOfWeek('2026-10-24', 7), '2026-10-18'); // 周日
  const w = weekDates('2026-10-24', 1);
  assert.equal(w.length, 7);
  assert.equal(w[0], '2026-10-19');
  assert.equal(w[6], '2026-10-25');
});

test('日期：月历网格覆盖整月且行数固定', () => {
  const cells = monthMatrix(2026, 10, 1);
  assert.equal(cells.length, 42);
  const inMonth = cells.filter((c) => c.inMonth);
  assert.equal(inMonth.length, 31);
  assert.equal(cells[0].date.length, 10);
});

test('日期：时间换算与跨零点', () => {
  assert.equal(minutesOf('09:30'), 570);
  assert.equal(hmFromMinutes(570), '09:30');
  assert.equal(endTimeHM('23:30', 90), '01:00');
  assert.equal(endTimeHM('', 90), '');
});

test('日期：今天字符串格式正确', () => {
  assert.match(todayStr(), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(ymd(parseYmd('2026-03-05')), '2026-03-05');
  assert.equal(fmtFullCN('2026-10-24'), '10月24日 周六');
});

/* ---------------- 精确时间戳（记录板块用） ---------------- */
test('精确时间：格式到秒且带星期', () => {
  // 本地时区，不做 UTC 转换；2026-10-25 是周日、10-24 是周六
  assert.equal(fullStampCN(new Date(2026, 9, 25, 14, 30, 5).getTime()),
    '2026年10月25日 周日 14:30:05');
  assert.equal(fullStampCN(new Date(2026, 9, 24, 8, 0, 0).getTime()),
    '2026年10月24日 周六 08:00:00');
  assert.equal(fullStampCN(new Date(2026, 0, 5, 9, 7, 3).getTime()),
    '2026年1月5日 周一 09:07:03');
});

test('精确时间：个位数补零、跨年边界', () => {
  assert.equal(fullStampCN(new Date(2026, 11, 31, 0, 0, 0).getTime()),
    '2026年12月31日 周四 00:00:00');
  assert.equal(fullStampCN(new Date(2027, 0, 1, 23, 59, 59).getTime()),
    '2027年1月1日 周五 23:59:59');
});

test('精确时间：非法值返回空串（不编造时间）', () => {
  assert.equal(fullStampCN(NaN), '');
  assert.equal(fullStampCN(undefined), '');
  assert.equal(fullStampCN(null), '');
  assert.equal(fullStampCN('not-a-number'), '');
});

/* ---------------- 重复规则 ---------------- */
test('重复：每天在起始日及之后命中', () => {
  const rule = { type: 'daily' };
  assert.equal(shouldGenerate(rule, '2026-10-24', '2026-10-24'), true);
  assert.equal(shouldGenerate(rule, '2026-10-24', '2026-10-25'), true);
  assert.equal(shouldGenerate(rule, '2026-10-24', '2026-10-23'), false);
});

test('重复：每周只命中指定星期', () => {
  const rule = { type: 'weekly', weekdays: [6] }; // 周六
  assert.equal(shouldGenerate(rule, '2026-10-01', '2026-10-24'), true);  // 周六
  assert.equal(shouldGenerate(rule, '2026-10-01', '2026-10-25'), false); // 周日
  assert.equal(shouldGenerate(rule, '2026-10-24', '2026-10-17'), false); // 早于起始
});

test('重复：多次选同一天不会重复', () => {
  const r = normalizeRepeat({ type: 'weekly', weekdays: [3, 3, 1] });
  assert.deepEqual(r.weekdays, [1, 3]);
  assert.equal(matchesRepeat(r, '2026-10-21'), true); // 周三
  assert.equal(repeatLabel(r), '每周一、三');
  assert.equal(repeatLabel({ type: 'daily' }), '每天');
  assert.equal(repeatLabel({ type: 'none' }), '');
});

test('重复：非法规则退化为 none', () => {
  assert.deepEqual(normalizeRepeat(null), { type: 'none', weekdays: [] });
  assert.deepEqual(normalizeRepeat({ type: 'weekly', weekdays: [0, 9] }), { type: 'none', weekdays: [] });
});

/* ---------------- 首页摘要 ---------------- */
test('摘要：多项组合与文案', () => {
  assert.equal(buildSummary({}), '今天没有安排，随便记点什么吧');
  assert.match(buildSummary({ pendingTasks: 4 }), /今天还有 <b>4 件事<\/b>没做完/);
  assert.match(buildSummary({ dueTomorrow: 1 }), /明天截止/);
  const both = buildSummary({ pendingTasks: 2, dueToday: 1, showsToday: 3 });
  assert.match(both, /2 件事/);
  assert.match(both, /今天截止/);
  assert.match(both, /3 部番/);
  // 今天截止优先于明天截止，不重复出现
  assert.doesNotMatch(buildSummary({ dueToday: 2, dueTomorrow: 3 }), /明天截止/);
});

/* ---------------- 备份结构 ---------------- */
const sample = () => ({
  tasks: [{ id: 't1', title: 'a', updatedAt: 10 }],
  notes: [{ id: 'n1', content: 'x', updatedAt: 20 }],
});

test('备份：导出结构完整', () => {
  const b = buildBackup({ data: sample(), settings: { theme: 'dark', weekStart: 7 }, now: new Date(2026, 9, 24, 21, 30) });
  assert.equal(b.app, 'jc-life');
  assert.equal(b.version, SCHEMA_VERSION);
  assert.match(b.exportedAt, /^2026-10-24T21:30/);
  for (const s of DATA_STORES) assert.ok(Array.isArray(b.data[s]), `${s} 应为数组`);
  assert.deepEqual(b.settings, { theme: 'dark', weekStart: 7 });
});

test('备份：校验通过正常文件', () => {
  const b = buildBackup({ data: sample() });
  assert.equal(validateBackup(b).ok, true);
});

test('备份：校验拒绝各种坏文件', () => {
  assert.equal(validateBackup(null).ok, false);
  assert.match(validateBackup({}).error, /不是本应用|版本/);
  assert.equal(validateBackup({ app: 'other', version: 1, data: {} }).ok, false);
  assert.equal(validateBackup({ app: 'jc-life', version: 99, data: {} }).ok, false);
  assert.equal(validateBackup({ app: 'jc-life', version: 1 }).ok, false);
  assert.equal(validateBackup({ app: 'jc-life', version: 1, data: { tasks: 'oops' } }).ok, false);
  assert.equal(validateBackup({ app: 'jc-life', version: 1, data: { tasks: [{ title: 'no id' }] } }).ok, false);
  assert.equal(validateBackup({ app: 'jc-life', version: 1, data: {}, settings: { theme: 'pink' } }).ok, false);
  assert.equal(validateBackup({ app: 'jc-life', version: 1, data: {}, settings: { weekStart: 3 } }).ok, false);
});

test('备份：合并保留较新的一条', () => {
  const a = [{ id: '1', v: 'old', updatedAt: 100 }, { id: '2', v: 'keep', updatedAt: 5 }];
  const b = [{ id: '1', v: 'new', updatedAt: 200 }, { id: '3', v: 'add', updatedAt: 1 }];
  const m = mergeRecords(a, b);
  assert.equal(m.length, 3);
  assert.equal(m.find((x) => x.id === '1').v, 'new');
  assert.equal(m.find((x) => x.id === '2').v, 'keep');

  // 反过来合并，旧数据不能覆盖新数据
  const m2 = mergeRecords([{ id: '1', v: 'new', updatedAt: 200 }], [{ id: '1', v: 'old', updatedAt: 100 }]);
  assert.equal(m2[0].v, 'new');
});

test('备份：mergeAll 覆盖所有数据段', () => {
  const out = mergeAll({ tasks: [{ id: 't', updatedAt: 1 }] }, { notes: [{ id: 'n', updatedAt: 1 }] });
  for (const s of DATA_STORES) assert.ok(Array.isArray(out[s]));
  assert.equal(out.tasks.length, 1);
  assert.equal(out.notes.length, 1);
});

test('备份：文件名格式', () => {
  assert.equal(backupFileName(new Date(2026, 0, 5, 9, 7)), '景臣备份-20260105-0907.json');
});
