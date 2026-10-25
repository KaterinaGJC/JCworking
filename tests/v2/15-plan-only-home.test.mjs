// 问题 15：底部「计划」标签要删掉，今日计划只作为首页的一部分存在
// 复现点：底部标签栏不该再有「计划」；首页那张卡要能就地新增/勾选/编辑/换日期/开月历；
//         老地址 #/plan 回落到首页而不是独立页面；首页依旧不含课表内容（C-01 不能被破坏）。
import { bootApp, shutdownApp, freshPage, goto, ok, eq, report } from '../lib.mjs';

let exitCode = 1;

const seed = (page, code) => page.eval(`(async () => {
  const st = await import('/js/store.js');
  const d = await import('/js/core/dates.js');
  const { uid } = await import('/js/util.js');
  ${code}
})()`);

const planSel = '[data-card="plan"]';

try {
  await bootApp();
  const page = await freshPage();

  // ---------- 1. 底部标签栏里没有「计划」 ----------
  await goto(page, '#/home');
  await page.waitFor(`document.querySelector('.home-body') !== null`, { message: '首页渲染' });
  const tabs = await page.eval(`[...document.querySelectorAll('#tabbar .tab')].map(t => t.dataset.act)`);
  eq('底部标签只剩 4 个', tabs.length, 4);
  ok('底部没有「计划」标签', !tabs.includes('plan'), JSON.stringify(tabs));
  ok('底栏文案里找不到「计划」', await page.eval(
    `!document.querySelector('#tabbar').textContent.includes('计划')`));
  ok('其余四个标签都还在', ['home', 'schedule', 'fun', 'memo'].every((k) => tabs.includes(k)),
    JSON.stringify(tabs));

  // ---------- 2. 老地址 #/plan 回落到首页，不再是独立页面 ----------
  await goto(page, '#/plan');
  await new Promise((r) => setTimeout(r, 350));
  ok('老地址 #/plan 回落到首页', await page.eval(
    `document.querySelector('[data-page="home"]') !== null`));
  eq('标题是首页的「景臣」而不是「今日计划」', await page.eval(
    `document.querySelector('#pageTitle').textContent`), '景臣');
  ok('首页不显示返回按钮（它是一级根页）', await page.eval(
    `document.querySelector('#btnBack').classList.contains('hidden')`));

  // ---------- 3. 首页计划卡：空状态 + 就地新增入口 ----------
  await goto(page, '#/home');
  await page.waitFor(`document.querySelector('${planSel} .plan-body') !== null`,
    { message: '首页计划管理区' });
  ok('首页有计划管理区', true);
  ok('管理区有日期条', await page.eval(
    `document.querySelector('${planSel} .datebar .mid') !== null`));
  ok('空状态给人话提示', await page.eval(
    `document.querySelector('${planSel}').textContent.includes('今天还没有安排')`));
  ok('卡片头有新增按钮', await page.eval(
    `document.querySelector('${planSel} [data-plan-add]') !== null`));
  ok('不占用全局悬浮按钮（首页无 fab）', await page.eval(
    `document.querySelector('#fab').hidden === true`));
  ok('顶栏也没有 ＋（首页顶栏是齿轮）', await page.eval(
    `document.querySelector('#btnPlus').classList.contains('hidden')`));

  // ---------- 4. 就地新增（带时间 → 进时间轴） ----------
  await page.click(`${planSel} [data-plan-add]`);
  await page.waitFor(`document.querySelector('#f-title') !== null`, { message: '新增面板' });
  await page.type('#f-title', '首页加的事');
  await page.type('#f-time', '15:30');
  await page.click('.sheet .row .btn[data-i="1"]');
  await new Promise((r) => setTimeout(r, 500));

  ok('新增的条目出现在首页管理区', await page.eval(
    `[...document.querySelectorAll('${planSel} .titem .t')].some(e => e.textContent.includes('首页加的事'))`));
  eq('已落库', await page.eval(
    `(async () => (await import('/js/store.js')).state.tasks.length)()`), 1);
  eq('进度数字随之更新', await page.eval(
    `document.querySelector('${planSel} .frac').textContent`), '0/1');
  ok('有时间的进了时间轴', await page.eval(
    `[...document.querySelectorAll('${planSel} .titem .time')].some(e => e.textContent === '15:30')`));
  ok('有待安排分组', await page.eval(`document.querySelector('${planSel} #noTimeList') !== null`));
  ok('已完成分组默认展开', await page.eval(
    `document.querySelector('${planSel} #doneGroup')?.classList.contains('open')`));
  ok('没有跳到别的页面', await page.eval(`document.querySelector('[data-page="home"]') !== null`));

  // ---------- 5. 就地勾选 ----------
  await page.click(`${planSel} .titem .cbox`);
  await new Promise((r) => setTimeout(r, 450));
  eq('勾选后进度变成 1/1', await page.eval(
    `document.querySelector('${planSel} .frac').textContent`), '1/1');
  ok('勾选后进入已完成区', await page.eval(
    `[...document.querySelectorAll('${planSel} #doneGroup .titem .t')]
      .some(e => e.textContent.includes('首页加的事'))`));

  // ---------- 6. 点条目就地编辑 ----------
  await page.eval(`[...document.querySelectorAll('${planSel} [data-open]')]
    .find(e => e.textContent.includes('首页加的事')).click()`);
  await page.waitFor(`document.querySelector('#f-title') !== null`, { message: '编辑面板' });
  await page.type('#f-title', '（改过）');
  await page.click('.sheet .row .btn[data-i="1"]');
  await new Promise((r) => setTimeout(r, 450));
  ok('编辑在首页生效', await page.eval(
    `[...document.querySelectorAll('${planSel} .titem .t')].some(e => e.textContent.includes('（改过）'))`));

  // ---------- 7. 换日期 / 回今天 / 开月历，全在首页 ----------
  const today = await page.eval(`(async () => {
    const d = await import('/js/core/dates.js');
    return d.fmtFullCN(d.todayStr());
  })()`);
  await page.click(`${planSel} [data-nav="1"]`);
  await new Promise((r) => setTimeout(r, 450));
  const midAfterNav = await page.eval(
    `document.querySelector('${planSel} .datebar .mid').textContent`);
  ok('首页可以切到别的日期', midAfterNav !== today, `${today} → ${midAfterNav}`);

  await page.click(`${planSel} [data-act="today"]`);
  await new Promise((r) => setTimeout(r, 450));
  eq('能切回今天', await page.eval(
    `document.querySelector('${planSel} .datebar .mid').textContent`), today);

  await page.click(`${planSel} [data-act="calendar"]`);
  await page.waitFor(`document.querySelector('.calendar') !== null`, { message: '月历打开' });
  ok('首页可以打开月历', true);
  ok('月历里没有可选日期时也不报错', await page.eval(
    `document.querySelectorAll('.cd[data-day]').length > 0`));
  await page.click('.sheet .row .btn[data-i="0"]');
  await new Promise((r) => setTimeout(r, 350));
  ok('月历关掉后仍在首页', await page.eval(
    `document.querySelector('${planSel} .plan-body') !== null`));

  // ---------- 8. 重进首页回到今天（板块重置的规矩还在） ----------
  await page.click(`${planSel} [data-nav="1"]`);
  await new Promise((r) => setTimeout(r, 400));
  await goto(page, '#/fun');
  await page.waitFor(`document.querySelector('.fun-body') !== null`);
  await goto(page, '#/home');
  await page.waitFor(`document.querySelector('${planSel} .datebar .mid') !== null`);
  await new Promise((r) => setTimeout(r, 300));
  eq('从别处回首页，计划区回到今天', await page.eval(
    `document.querySelector('${planSel} .datebar .mid').textContent`), today);

  // ---------- 9. 首页依旧不含课表内容（C-01 硬约束） ----------
  await seed(page, `
    const t = d.todayStr();
    const stu = { id: uid(), name: '张同学', createdAt: Date.now() };
    await st.saveRecord('students', stu);
    await st.saveRecord('lessons', { id: uid(), date: t, start: '09:00', duration: 90,
      type: 'one', place: '', status: 'todo', content: '三角函数', homework: '',
      repeat: { type: 'none', weekdays: [], sourceId: null },
      members: [{ studentId: stu.id, name: '张同学', state: null, note: '', attendance: 'todo' }],
      createdAt: Date.now() });
  `);
  await page.reload();
  await goto(page, '#/home');
  await page.waitFor(`document.querySelector('${planSel} .plan-body') !== null`);
  await new Promise((r) => setTimeout(r, 300));
  const homeText = await page.eval(`document.querySelector('.home-body').textContent`);
  ok('首页仍不出现学生姓名（C-01）', !homeText.includes('张同学'));
  ok('首页仍不出现课程内容（C-01）', !homeText.includes('三角函数'));
  ok('首页仍不出现课表字样（C-01）', !/课表|下节课|上一节/.test(homeText));

  // ---------- 10. 刷新后计划仍在首页 ----------
  await page.reload();
  await goto(page, '#/home');
  await page.waitFor(`document.querySelector('${planSel} .plan-body') !== null`);
  await new Promise((r) => setTimeout(r, 350));
  ok('刷新后计划仍在首页', await page.eval(
    `[...document.querySelectorAll('${planSel} .titem .t')].some(e => e.textContent.includes('（改过）'))`));

  await page.close();
  exitCode = report('问题 15 · 计划只留在首页');
} catch (err) {
  console.error('测试异常：', err);
  exitCode = 1;
} finally {
  await shutdownApp();
}
process.exit(exitCode);
