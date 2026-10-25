// M2 · 今日计划
import { bootApp, shutdownApp, freshPage, goto, ok, eq, report } from './lib.mjs';

let exitCode = 1;

const addTask = (page, { title, time = '', date = null, repeat = 'none', weekdays = [] }) => page.eval(
  `(async () => {
    const st = await import('/js/store.js');
    const d = await import('/js/core/dates.js');
    const { uid } = await import('/js/util.js');
    const date = ${JSON.stringify(date)} || d.todayStr();
    const rec = {
      id: uid(), date, title: ${JSON.stringify(title)}, time: ${JSON.stringify(time)} || null,
      note: '', done: false, doneAt: null, sort: 0, createdAt: Date.now(),
      repeat: { type: ${JSON.stringify(repeat)}, weekdays: ${JSON.stringify(weekdays)}, sourceId: null },
    };
    await st.saveRecord('tasks', rec);
    return rec.id;
  })()`,
);

const taskTitles = (page) => page.eval(
  `[...document.querySelectorAll('.titem [data-open] .t')].map(e => e.textContent.trim())`,
);

/** 直接写库后强制重渲染：绕一圈回到首页计划区 */
const rerenderPlan = async (page) => {
  await goto(page, '#/schedule');
  await goto(page, '#/home');
  await page.waitFor(`document.querySelector('.plan-body') !== null`, { message: '计划区渲染' });
  await new Promise((r) => setTimeout(r, 200));
};

try {
  await bootApp();
  const page = await freshPage();
  await goto(page, '#/plan');
  await page.waitFor(`document.querySelector('.plan-body') !== null`, { message: '计划页渲染' });

  // --- 空状态 ---
  ok('空状态提示存在', await page.eval(`document.querySelector('.empty') !== null`));

  // --- 新增（无时间）---
  await page.click('[data-card="plan"] [data-plan-add]');
  await page.waitFor(`document.querySelector('#f-title') !== null`, { message: '新增面板' });
  await page.type('#f-title', '交季度总结');
  await page.click('.sheet .row .btn[data-i="1"]');
  await page.waitFor(`[...document.querySelectorAll('.titem .t')].some(e => e.textContent.includes('交季度总结'))`,
    { message: '无时间条目出现' });
  ok('无时间待办进入「待安排」（D-01）', true);

  // --- 新增（有时间）---
  await page.click('[data-card="plan"] [data-plan-add]');
  await page.waitFor(`document.querySelector('#f-title') !== null`);
  await page.type('#f-title', '联系家长');
  await page.type('#f-time', '14:00');
  await page.click('.sheet .row .btn[data-i="1"]');
  await page.waitFor(`document.querySelector('.titem .time') !== null`, { message: '时间轴条目' });
  eq('有时间待办进入时间轴（D-01）', await page.eval(`document.querySelector('.titem .time').textContent`), '14:00');

  // 再补两条，验证按时间排序
  await addTask(page, { title: '上午的会', time: '09:00' });
  await addTask(page, { title: '晚上的事', time: '20:00' });
  await rerenderPlan(page);
  const times = await page.eval(`[...document.querySelectorAll('.titem .time')].map(e => e.textContent)`);
  eq('时间轴按时间升序（D-01）', times, ['09:00', '14:00', '20:00']);

  // --- 勾选完成 ---
  const beforeDone = await page.eval(`document.querySelectorAll('.titem .cbox:not(.done)').length`);
  await page.click('.titem .cbox');
  await new Promise((r) => setTimeout(r, 250));
  const afterDone = await page.eval(`document.querySelectorAll('.titem .cbox:not(.done)').length`);
  eq('勾选后未完成数减一（D-02）', afterDone, beforeDone - 1);
  ok('已完成分组计数更新', (await page.eval(
    `document.querySelector('#doneGroup .h span').textContent`)).includes('1 项'));

  // 再点一次可撤销
  await page.eval(`document.querySelector('#doneGroup .h').click()`);
  await new Promise((r) => setTimeout(r, 150));
  await page.click('#doneGroup .list .cbox.done');
  await new Promise((r) => setTimeout(r, 250));
  ok('再点可取消完成（D-02）', await page.eval(`document.querySelectorAll('.titem .cbox.done').length === 0`));

  // --- 编辑 ---
  await page.eval(`[...document.querySelectorAll('[data-open]')]
    .find(e => e.textContent.includes('交季度总结')).click()`);
  await page.waitFor(`document.querySelector('#f-title') !== null`);
  await page.type('#f-title', '交季度总结（改）');
  await page.click('.sheet .row .btn[data-i="1"]');
  await new Promise((r) => setTimeout(r, 300));
  ok('编辑后标题已更新', (await taskTitles(page)).some((t) => t.includes('（改）')));

  // --- 删除 + 撤销 ---
  const delCountBefore = (await taskTitles(page)).length;
  await page.eval(`[...document.querySelectorAll('[data-open]')]
    .find(e => e.textContent.includes('晚上的事')).click()`);
  await page.waitFor(`document.querySelector('#f-del') !== null`);
  await page.click('#f-del');
  await page.waitFor(`document.querySelector('.confirm button[data-a="1"]') !== null`, { message: '删除确认' });
  await page.click('.confirm button[data-a="1"]');
  await new Promise((r) => setTimeout(r, 350));
  eq('删除后条目减少', (await taskTitles(page)).length, delCountBefore - 1);
  await page.click('.toast button');
  await new Promise((r) => setTimeout(r, 350));
  eq('撤销后条目恢复', (await taskTitles(page)).length, delCountBefore);

  // --- 重复任务：次日惰性生成（D-04）---
  await addTask(page, { title: '每天读书', repeat: 'daily', date: null });
  await rerenderPlan(page);
  await page.click('[data-nav="1"]');
  await new Promise((r) => setTimeout(r, 450));
  const nextDayHas = (await taskTitles(page)).some((t) => t.includes('每天读书'));
  ok('每天的重复任务次日自动出现（D-04）', nextDayHas);
  const hasSource = await page.eval(`(async () => {
    const st = await import('/js/store.js');
    return st.state.tasks.filter(t => t.repeat?.sourceId && t.title === '每天读书').length;
  })()`);
  ok('重复实例记录了来源（不会重复生成）', hasSource >= 1);

  // 再切一天，不应重复生成同一天
  await page.click('[data-act="today"]');
  await new Promise((r) => setTimeout(r, 300));
  await page.click('[data-nav="1"]');
  await new Promise((r) => setTimeout(r, 450));
  const dupCount = await page.eval(`(async () => {
    const st = await import('/js/store.js');
    const d = await import('/js/core/dates.js');
    const tomorrow = d.addDays(d.todayStr(), 1);
    return st.state.tasks.filter(t => t.date === tomorrow && t.title === '每天读书').length;
  })()`);
  eq('同一天不会重复生成', dupCount, 1);

  // --- 昨日结转（D-05）---
  const yesterday = await page.eval(`(async () => {
    const st = await import('/js/store.js');
    const db = await import('/js/db.js');
    const d = await import('/js/core/dates.js');
    const { uid } = await import('/js/util.js');
    const y = d.addDays(d.todayStr(), -1);
    await st.saveRecord('tasks', { id: uid(), date: y, title: '昨天没做完的事', time: null,
      note: '', done: false, doneAt: null, sort: 0, createdAt: Date.now(),
      repeat: { type: 'none', weekdays: [], sourceId: null } });
    await db.remove('meta', 'lastOpenDate');
    return y;
  })()`);
  ok('已造出昨天的未完成项', !!yesterday);

  await page.reload();
  await goto(page, '#/plan');
  await page.waitFor(`document.querySelector('[data-carry="move"]') !== null`, { message: '结转提示出现' });
  ok('首次打开出现结转提示（D-05）', true);
  const tipText = await page.eval(`document.querySelector('.tipcard').textContent`);
  ok('提示里写明几项没做完', /1 项/.test(tipText), tipText);

  await page.click('[data-carry="move"]');
  await new Promise((r) => setTimeout(r, 450));
  const carried = (await taskTitles(page)).some((t) => t.includes('昨天没做完的事'));
  ok('选择转到今天后出现该条目（D-05）', carried);
  const yStillThere = await page.eval(`(async () => {
    const st = await import('/js/store.js');
    const d = await import('/js/core/dates.js');
    const y = d.addDays(d.todayStr(), -1);
    return st.state.tasks.filter(t => t.date === y).length;
  })()`);
  eq('昨天原记录仍保留（D-05）', yStillThere, 1);

  // 提示只出现一次
  await page.reload();
  await goto(page, '#/plan');
  await new Promise((r) => setTimeout(r, 450));
  ok('同一天不再重复提示（D-05）', await page.eval(`document.querySelector('.tipcard') === null`));

  // --- 月历跳转 ---
  await page.click('[data-act="calendar"]');
  await page.waitFor(`document.querySelector('.calendar') !== null`, { message: '月历打开' });
  const dayCell = await page.eval(`(() => {
    const els = [...document.querySelectorAll('.cd[data-day]')];
    const target = els.find(e => e.dataset.day.endsWith('-05'));
    return target ? target.dataset.day : null;
  })()`);
  ok('月历里有可选日期', !!dayCell, String(dayCell));
  await page.click(`.cd[data-day="${dayCell}"]`);
  await new Promise((r) => setTimeout(r, 450));
  const dayNum = Number(dayCell.slice(8));
  const midText = await page.eval(`document.querySelector('.datebar .mid').textContent`);
  ok('点日期后跳到该日', midText.includes(`${dayNum}日`), `${midText} / ${dayCell}`);

  // --- 拖动排序（D-03）---
  await page.click('[data-act="today"]');
  await new Promise((r) => setTimeout(r, 300));
  await addTask(page, { title: '排序A', time: '' });
  await addTask(page, { title: '排序B', time: '' });
  await addTask(page, { title: '排序C', time: '' });
  await rerenderPlan(page);

  const dragResult = await page.eval(`(async () => {
    const list = document.querySelector('#noTimeList');
    const readOrder = (l) => [...l.querySelectorAll('.titem[data-id] .t')].map(e => e.textContent.trim());
    const before = readOrder(list);
    const items = [...list.querySelectorAll('.titem[data-id]')];
    const a = items.find(i => i.textContent.includes('排序A'));
    const c = items.find(i => i.textContent.includes('排序C'));
    if (!a || !c) return { error: 'no-items', n: items.length };
    // 先把条目滚进视野，指针坐标才落在真实可见区域（真机上用户也是先看到再拖）
    a.scrollIntoView({ block: 'center' });
    await new Promise(r => setTimeout(r, 150));
    const ra = a.getBoundingClientRect();
    const rc = c.getBoundingClientRect();
    if (rc.bottom > window.innerHeight || rc.top < 0) {
      return { error: 'target-out-of-view', cTop: rc.top, cBottom: rc.bottom, innerH: window.innerHeight };
    }
    const fire = (type, el, y) => el.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: 1, isPrimary: true,
      clientX: rc.left + 20, clientY: y,
    }));
    fire('pointerdown', a, ra.top + ra.height / 2);
    await new Promise(r => setTimeout(r, 520));
    fire('pointermove', list, rc.bottom - 2);
    await new Promise(r => setTimeout(r, 80));
    fire('pointerup', list, rc.bottom - 2);
    await new Promise(r => setTimeout(r, 600));
    const after = readOrder(document.querySelector('#noTimeList'));
    return { before, after, beforeA: before.indexOf('排序A'), beforeC: before.indexOf('排序C'),
             afterA: after.indexOf('排序A'), afterC: after.indexOf('排序C') };
  })()`);
  ok('拖动前 A 在 C 之前', dragResult.beforeA >= 0 && dragResult.beforeA < dragResult.beforeC,
    JSON.stringify(dragResult));
  ok('拖动后 A 排到 C 之后（D-03）', dragResult.afterA > dragResult.afterC, JSON.stringify(dragResult));

  const persisted = await page.eval(`(async () => {
    const st = await import('/js/store.js');
    const d = await import('/js/core/dates.js');
    const rows = st.state.tasks.filter(t => t.date === d.todayStr() && /排序/.test(t.title))
      .sort((a, b) => a.sort - b.sort).map(t => t.title);
    return { rows, a: rows.indexOf('排序A'), c: rows.indexOf('排序C') };
  })()`);
  ok('新顺序已落库（D-03）', persisted.a > persisted.c, JSON.stringify(persisted));

  // --- 刷新后仍在（B-02）---
  await page.reload();
  await goto(page, '#/plan');
  await new Promise((r) => setTimeout(r, 550));
  ok('刷新后计划仍在', (await taskTitles(page)).length > 0);

  await page.close();
  exitCode = report('M2');
} catch (err) {
  console.error('M2 测试异常：', err);
  exitCode = 1;
} finally {
  await shutdownApp();
}
process.exit(exitCode);
