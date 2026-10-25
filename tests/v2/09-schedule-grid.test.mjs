// 修复项 09：课表要像中学课表那样按节次网格化，且节次时间可以改
import { bootApp, shutdownApp, freshPage, goto, ok, eq, report } from '../lib.mjs';

let exitCode = 1;

const slotCount = (page) => page.eval(`document.querySelectorAll('.tt-slot').length`);
const cellSel = (slotId, day) => `.tt-cell[data-day="${day}"][data-slot="${slotId}"]`;

try {
  await bootApp();
  const page = await freshPage();

  await goto(page, '#/schedule');
  await page.waitFor(`document.querySelector('.timetable') !== null`, { message: '网格渲染' });

  // ---------- 1. 网格结构 ----------
  eq('表头有 7 天', await page.eval(`document.querySelectorAll('.tt-day').length`), 7);
  eq('默认 8 节课（8 行节次）', await slotCount(page), 8);
  ok('左上角有占位，网格对齐', await page.eval(`document.querySelector('.tt-corner') !== null`));
  eq('一屏应有 7×8 个格子', await page.eval(`document.querySelectorAll('.tt-cell').length`), 56);
  ok('今天的列有高亮', await page.eval(`document.querySelectorAll('.tt-day.today').length === 1`));

  // ---------- 2. 点空格子 → 预填该天 + 该节次 ----------
  const target = await page.eval(`(() => {
    const day = document.querySelectorAll('.tt-day')[2].dataset.day;
    const slot = document.querySelectorAll('.tt-slot')[2].textContent;
    return { day, slot };
  })()`);
  await page.click(`[data-add-day="${target.day}"][data-add-slot="slot-3"]`);
  await page.waitFor(`document.querySelector('#l-slot') !== null`, { message: '表单打开' });
  eq('预填了点击的那一天', await page.eval(`document.querySelector('#l-date').value`), target.day);
  eq('预填了点击的那一节', await page.eval(`document.querySelector('#l-slot').value`), 'slot-3');

  // ---------- 3. 保存后落到该格子 ----------
  await page.type('[data-name="0"]', '网格测试生');
  await page.click('.sheet .row .btn[data-i="1"]');
  await new Promise((r) => setTimeout(r, 600));
  ok('课程出现在点的那一格', await page.eval(
    `document.querySelector('${cellSel('slot-3', target.day)}')?.querySelector('.lesson') !== null`));

  // 节次时间与课次开始时间一致
  const savedStart = await page.eval(`(async () => {
    const st = await import('/js/store.js');
    const l = st.state.lessons[0];
    return { start: l.start, slotId: l.slotId, duration: l.duration };
  })()`);
  eq('课次记录了节次 id', savedStart.slotId, 'slot-3');
  ok('开始时间取自节次（10:00）', savedStart.start === '10:00', JSON.stringify(savedStart));
  eq('时长取自节次（45 分钟）', savedStart.duration, 45);

  // ---------- 4. 同一格两节课都能显示 ----------
  await page.click(`[data-add-day="${target.day}"][data-add-slot="slot-3"]`);
  await page.waitFor(`document.querySelector('#l-slot') !== null`);
  await page.type('[data-name="0"]', '同格第二人');
  await page.click('.sheet .row .btn[data-i="1"]');
  await new Promise((r) => setTimeout(r, 600));
  eq('同一格放得下两节课', await page.eval(
    `document.querySelector('${cellSel('slot-3', target.day)}').querySelectorAll('.lesson').length`), 2);

  // ---------- 5. 改节次时间 → 网格跟着变 ----------
  await goto(page, '#/settings');
  await page.waitFor(`document.querySelector('[data-act="slots"]') !== null`);
  ok('设置里有「课表时间段」入口', await page.eval(
    `(document.querySelector('[data-act="slots"]')?.textContent || '').includes('课表时间段')`));

  await page.click('[data-act="slots"]');
  await page.waitFor(`document.querySelector('[data-slot-edit="0"]') !== null`, { message: '时间段列表' });
  eq('列表里是 8 节', await page.eval(`document.querySelectorAll('[data-slot-edit]').length`), 8);

  await page.click('[data-slot-edit="2"]');
  await page.waitFor(`document.querySelector('#s-start') !== null`, { message: '编辑单节' });
  await page.type('#s-label', '第三节（改）');
  await page.type('#s-start', '10:20');
  await page.click('.sheet .row .btn[data-i="1"]');
  await new Promise((r) => setTimeout(r, 500));
  await page.click('.sheet .row .btn[data-i="1"]'); // 关闭「完成」
  await new Promise((r) => setTimeout(r, 300));

  const savedSlots = await page.eval(`(async () => {
    const st = await import('/js/store.js');
    return st.state.settings.timeSlots?.map(s => s.label + ' ' + s.start) || null;
  })()`);
  ok('节次改动已存进设置', Array.isArray(savedSlots) && savedSlots[2].includes('10:20'), JSON.stringify(savedSlots));

  await goto(page, '#/schedule');
  await page.waitFor(`document.querySelector('.timetable') !== null`);
  const thirdRow = await page.eval(`document.querySelectorAll('.tt-slot')[2].textContent.replace(/\\s+/g, ' ')`);
  ok('课表左列显示新的节次名与时间', thirdRow.includes('第三节（改）') && thirdRow.includes('10:20'), thirdRow);
  ok('原来排在这节的课没有丢', await page.eval(
    `document.querySelector('${cellSel('slot-3', target.day)}')?.querySelectorAll('.lesson').length === 2`));

  // ---------- 6. 新增 / 删除节次 ----------
  await goto(page, '#/settings');
  await page.waitFor(`document.querySelector('[data-act="slots"]') !== null`);
  await page.click('[data-act="slots"]');
  await page.waitFor(`document.querySelector('[data-slot-edit="0"]') !== null`);
  await page.click('.sheet .row .btn[data-i="0"]'); // 加一节
  await new Promise((r) => setTimeout(r, 500));
  eq('加一节后列表变 9 行', await page.eval(`document.querySelectorAll('[data-slot-edit]').length`), 9);
  await page.click('.sheet .row .btn[data-i="1"]');
  await new Promise((r) => setTimeout(r, 300));

  await goto(page, '#/schedule');
  await page.waitFor(`document.querySelector('.timetable') !== null`);
  eq('课表网格跟着变成 9 行', await slotCount(page), 9);
  eq('格子总数随之变化', await page.eval(`document.querySelectorAll('.tt-cell').length`), 63);

  // 删掉刚加的那一节
  await goto(page, '#/settings');
  await page.waitFor(`document.querySelector('[data-act="slots"]') !== null`);
  await page.click('[data-act="slots"]');
  await page.waitFor(`document.querySelector('[data-slot-edit="0"]') !== null`);
  await page.click('[data-slot-edit="8"]');
  await page.waitFor(`document.querySelector('#s-del') !== null`);
  await page.click('#s-del');
  await new Promise((r) => setTimeout(r, 500));
  await page.click('.sheet .row .btn[data-i="1"]');
  await new Promise((r) => setTimeout(r, 300));

  await goto(page, '#/schedule');
  await page.waitFor(`document.querySelector('.timetable') !== null`);
  eq('删除后回到 8 行', await slotCount(page), 8);

  // ---------- 7. 自定义时间的课归到「其它时间」 ----------
  await page.eval(`(async () => {
    const st = await import('/js/store.js');
    const d = await import('/js/core/dates.js');
    await st.saveRecord('students', { id: 'sx1', name: '自定义时间生', createdAt: Date.now() });
    await st.saveRecord('lessons', { id: 'lx1', date: d.todayStr(), start: '12:34', duration: 30,
      slotId: null, type: 'one', place: '', status: 'todo', content: '', homework: '',
      repeat: { type: 'none', weekdays: [], sourceId: null },
      members: [{ studentId: 'sx1', name: '自定义时间生', state: null, note: '', attendance: 'todo' }],
      createdAt: Date.now() });
  })()`);
  await goto(page, '#/home');
  await goto(page, '#/schedule');
  await page.waitFor(`document.querySelector('.timetable') !== null`);
  await new Promise((r) => setTimeout(r, 300));
  ok('不在节次里的课显示在「其它时间」', await page.eval(`
    [...document.querySelectorAll('.grouph')].some(h => h.textContent.includes('其它时间'))`));
  ok('这一节没有被硬塞进某个格子', await page.eval(`
    ![...document.querySelectorAll('.tt-cell .lname')].some(e => e.textContent.includes('自定义时间生'))`));

  // ---------- 8. 刷新后节次设置仍生效 ----------
  await page.reload();
  await goto(page, '#/schedule');
  await page.waitFor(`document.querySelector('.timetable') !== null`);
  const afterReload = await page.eval(`document.querySelectorAll('.tt-slot')[2].textContent.replace(/\\s+/g, ' ')`);
  ok('刷新后仍是改过的节次', afterReload.includes('10:20'), afterReload);

  await page.close();
  exitCode = report('修复项 09 · 网格课表');
} catch (err) {
  console.error('测试异常：', err);
  exitCode = 1;
} finally {
  await shutdownApp();
}
process.exit(exitCode);
