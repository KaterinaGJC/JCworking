// 修复项 07：重新进入板块应回到初始一级界面（不记住上次的日期/分区/周次/搜索状态）
import { bootApp, shutdownApp, freshPage, goto, ok, eq, report } from '../lib.mjs';

let exitCode = 1;

const todayText = (page) => page.eval(`(async () => {
  const d = await import('/js/core/dates.js');
  return d.fmtFullCN(d.todayStr());
})()`);

try {
  await bootApp();
  const page = await freshPage();

  // ---------- 今日计划：换到明天，切走再切回，应回到今天 ----------
  await goto(page, '#/plan');
  await page.waitFor(`document.querySelector('.datebar .mid') !== null`);
  const today = await todayText(page);
  await page.click('[data-nav="1"]');
  await new Promise((r) => setTimeout(r, 350));
  const tomorrowText = await page.eval(`document.querySelector('.datebar .mid').textContent`);
  ok('先切到别的日期', tomorrowText !== today, tomorrowText);

  await goto(page, '#/fun');
  await new Promise((r) => setTimeout(r, 300));
  await goto(page, '#/plan');
  await page.waitFor(`document.querySelector('.datebar .mid') !== null`);
  await new Promise((r) => setTimeout(r, 250));
  eq('重新进入计划页回到今天', await page.eval(`document.querySelector('.datebar .mid').textContent`), today);

  // ---------- 娱乐：切到「活动」，切走再回来，应回到「游戏库」 ----------
  await goto(page, '#/fun');
  await page.waitFor(`document.querySelector('#funSeg') !== null`);
  await page.click('#funSeg [data-tab="act"]');
  await new Promise((r) => setTimeout(r, 300));
  ok('先切到活动分区', await page.eval(
    `document.querySelector('#funSeg [data-tab="act"]').classList.contains('on')`));

  await goto(page, '#/home');
  await new Promise((r) => setTimeout(r, 300));
  await goto(page, '#/fun');
  await page.waitFor(`document.querySelector('#funSeg') !== null`);
  await new Promise((r) => setTimeout(r, 250));
  ok('重新进入娱乐页回到游戏库', await page.eval(
    `document.querySelector('#funSeg [data-tab="lib"]').classList.contains('on')`));

  // ---------- 课表：切到下周，切走再回来，应回到本周 ----------
  await goto(page, '#/schedule');
  await page.waitFor(`document.querySelector('.week-head .range') !== null`);
  const thisWeek = await page.eval(`document.querySelector('.week-head .range').textContent`);
  await page.click('[data-week="1"]');
  await new Promise((r) => setTimeout(r, 400));
  const nextWeek = await page.eval(`document.querySelector('.week-head .range').textContent`);
  ok('先切到下一周', nextWeek !== thisWeek, `${thisWeek} → ${nextWeek}`);

  await goto(page, '#/memo');
  await new Promise((r) => setTimeout(r, 300));
  await goto(page, '#/schedule');
  await page.waitFor(`document.querySelector('.week-head .range') !== null`);
  await new Promise((r) => setTimeout(r, 300));
  eq('重新进入课表回到本周', await page.eval(
    `document.querySelector('.week-head .range').textContent`), thisWeek);

  // ---------- 备忘：打开搜索，切走再回来，搜索应关闭 ----------
  await goto(page, '#/memo');
  await page.waitFor(`document.querySelector('#btnSearch') !== null`);
  await page.click('#btnSearch');
  await page.waitFor(`document.querySelector('#memoSearch') !== null`);
  ok('先打开搜索条', true);

  await goto(page, '#/plan');
  await new Promise((r) => setTimeout(r, 300));
  await goto(page, '#/memo');
  await page.waitFor(`document.querySelector('#memoInput') !== null`);
  await new Promise((r) => setTimeout(r, 250));
  ok('重新进入备忘页搜索已关闭', await page.eval(`document.querySelector('#memoSearch') === null`));

  // ---------- 从详情页返回，不应被重置 ----------
  await page.eval(`(async () => {
    const st = await import('/js/store.js');
    const d = await import('/js/core/dates.js');
    await st.saveRecord('students', { id: 'br1', name: '重置测试', createdAt: Date.now() });
    await st.saveRecord('lessons', { id: 'br2', date: d.addDays(d.todayStr(), 14), start: '10:00',
      duration: 90, type: 'one', place: '', status: 'todo', content: '', homework: '',
      repeat: { type: 'none', weekdays: [], sourceId: null },
      members: [{ studentId: 'br1', name: '重置测试', state: null, note: '', attendance: 'todo' }],
      createdAt: Date.now() });
  })()`);
  await goto(page, '#/schedule');
  await page.waitFor(`document.querySelector('.week-head .range') !== null`);
  await page.click('[data-week="1"]');
  await new Promise((r) => setTimeout(r, 400));
  const weekKept = await page.eval(`document.querySelector('.week-head .range').textContent`);
  await goto(page, '#/lesson?id=br2');
  await page.waitFor(`document.querySelector('#l-content') !== null`);
  await page.click('#btnBack');
  await new Promise((r) => setTimeout(r, 500));
  eq('从课次详情返回时保留原来那一周（不被重置）', await page.eval(
    `document.querySelector('.week-head .range').textContent`), weekKept);

  // ---------- 再点一次当前标签，也回到初始界面 ----------
  await page.click('[data-week="1"]');
  await new Promise((r) => setTimeout(r, 400));
  const other = await page.eval(`document.querySelector('.week-head .range').textContent`);
  ok('先切到下周（用于测试重复点标签）', other !== weekKept);
  await page.click('.tab[data-act="schedule"]');
  await new Promise((r) => setTimeout(r, 500));
  eq('再点一次当前标签回到本周', await page.eval(
    `document.querySelector('.week-head .range').textContent`), thisWeek);

  await page.close();
  exitCode = report('修复项 07 · 重进板块重置');
} catch (err) {
  console.error('测试异常：', err);
  exitCode = 1;
} finally {
  await shutdownApp();
}
process.exit(exitCode);
