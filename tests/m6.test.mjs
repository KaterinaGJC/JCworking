// M6 · 首页聚合
import { bootApp, shutdownApp, freshPage, goto, ok, eq, report } from './lib.mjs';

let exitCode = 1;

const seed = (page, code) => page.eval(`(async () => {
  const st = await import('/js/store.js');
  const d = await import('/js/core/dates.js');
  const { uid } = await import('/js/util.js');
  ${code}
})()`);

try {
  await bootApp();
  const page = await freshPage();

  await goto(page, '#/home');
  await page.waitFor(`document.querySelector('.hero') !== null`, { message: '首页渲染' });
  ok('首页有三张卡片', (await page.eval(`document.querySelectorAll('.card').length`)) >= 3);
  ok('首页标题为「景臣」', (await page.eval(`document.querySelector('#pageTitle').textContent`)) === '景臣');

  // --- 空状态 ---
  ok('空首页给出人话摘要', (await page.eval(
    `document.querySelector('#homeSummary').textContent`)).includes('今天没有安排'));
  ok('计划卡显示没有安排', (await page.eval(
    `document.querySelector('[data-card="plan"]').textContent`)).includes('今天还没有安排'));

  // --- C-02 计划卡与计划页一致 ---
  await seed(page, `
    const today = d.todayStr();
    for (let i = 0; i < 5; i++) {
      await st.saveRecord('tasks', { id: uid(), date: today, title: '任务' + i, time: null,
        note: '', done: false, doneAt: null, sort: i, createdAt: Date.now(),
        repeat: { type: 'none', weekdays: [], sourceId: null } });
    }
    await st.saveRecord('tasks', { id: uid(), date: today, title: '已完成的', time: null,
      note: '', done: true, doneAt: Date.now(), sort: 9, createdAt: Date.now(),
      repeat: { type: 'none', weekdays: [], sourceId: null } });
  `);
  await goto(page, '#/plan');
  await new Promise((r) => setTimeout(r, 300));
  await goto(page, '#/home');
  // 等计划区真正填充完（.frac 是同步渲染的，等它会读到还没填充的 .titem）
  await page.waitFor(`document.querySelector('[data-card="plan"] .plan-body') !== null`);

  const frac = await page.eval(`document.querySelector('[data-card="plan"] .frac').textContent`);
  eq('进度数字正确（C-02）', frac, '1/6');
  // v3 起首页卡片就是完整的计划管理区，不再是"前 3 条预览"，当天待办应全部可见
  eq('计划卡完整展示当天待办（C-02）', await page.eval(
    `document.querySelectorAll('[data-card="plan"] .titem .cbox:not(.done)').length`), 5);
  ok('摘要写明未完成件数（C-02）', (await page.eval(
    `document.querySelector('#homeSummary').textContent`)).includes('5 件事'));

  // --- C-03 / C-04 备忘卡 ---
  await page.type('#homeQuick', '首页直接记一条');
  await page.press('Enter', '#homeQuick');
  await new Promise((r) => setTimeout(r, 400));
  eq('首页就地记下便签（C-04）', await page.eval(
    `(async () => (await import('/js/store.js')).state.notes.length)()`), 1);
  ok('备忘卡显示该条（C-03）', await page.eval(
    `document.querySelector('[data-card="memo"]').textContent.includes('首页直接记一条')`));
  ok('便签出现在备忘页', await (async () => {
    await goto(page, '#/memo');
    await new Promise((r) => setTimeout(r, 300));
    return page.eval(`document.querySelectorAll('.note').length === 1`);
  })());
  await goto(page, '#/home');

  // --- C-05 娱乐摘要 ---
  await seed(page, `
    const today = d.todayStr();
    await st.saveRecord('activities', { id: uid(), game: '明日方舟', title: '危机合约',
      due: d.addDays(today, 1), note: '', done: false, createdAt: Date.now() });
    await st.saveRecord('shows', { id: uid(), name: '葬送的芙莉莲',
      weekday: (d.weekdayIndex1(today)), current: 8, total: 28, kind: 'anime' });
    await st.saveRecord('experiences', { id: uid(), title: '星露谷物语', type: 'game',
      rating: 5, body: '好玩', progress: '已通关', date: today, createdAt: Date.now() });
  `);
  await goto(page, '#/plan');
  await goto(page, '#/home');
  await page.waitFor(`document.querySelector('[data-card="fun"]') !== null`);

  const funText = await page.eval(`document.querySelector('[data-card="fun"]').textContent`);
  ok('显示明天截止的活动（C-05）', funText.includes('危机合约'), funText);
  ok('活动带「还剩 1 天」', funText.includes('还剩 1 天'));
  ok('显示今天更新的番', funText.includes('芙莉莲'));
  ok('显示最近一条体验', funText.includes('星露谷物语'));

  // --- C-06 清空娱乐数据后不出现空白行 ---
  await seed(page, `
    for (const a of [...st.state.activities]) await st.removeRecord('activities', a.id);
    for (const s of [...st.state.shows]) await st.removeRecord('shows', s.id);
    for (const e of [...st.state.experiences]) await st.removeRecord('experiences', e.id);
  `);
  await goto(page, '#/plan');
  await goto(page, '#/home');
  await new Promise((r) => setTimeout(r, 300));
  const funText2 = await page.eval(`document.querySelector('[data-card="fun"]').textContent`);
  ok('娱乐数据清空后显示空状态而不是空白行（C-06）',
    funText2.includes('没有要管的娱乐安排'), funText2);
  ok('不再残留活动名', !funText2.includes('危机合约'));

  // --- C-01 首页绝不出现课表内容 ---
  await seed(page, `
    const today = d.todayStr();
    const stu = { id: uid(), name: '王小明', createdAt: Date.now() };
    await st.saveRecord('students', stu);
    await st.saveRecord('lessons', { id: uid(), date: today, start: '09:00', duration: 90,
      type: 'one', place: '', status: 'todo', content: '二次函数', homework: '',
      repeat: { type: 'none', weekdays: [], sourceId: null },
      members: [{ studentId: stu.id, name: '王小明', state: null, note: '', attendance: 'todo' }],
      createdAt: Date.now() });
  `);
  await goto(page, '#/plan');
  await goto(page, '#/home');
  await new Promise((r) => setTimeout(r, 400));

  const homeText = await page.eval(`document.querySelector('.home-body').textContent`);
  ok('首页不出现学生姓名（C-01）', !homeText.includes('王小明'), homeText.slice(0, 120));
  ok('首页不出现课程内容（C-01）', !homeText.includes('二次函数'));
  ok('首页不出现「下节课」字样（C-01）', !homeText.includes('下节课'));
  ok('首页不出现课表/上课字样（C-01）', !/课表|上一节|上课中/.test(homeText));

  // 页面上也检查一遍（防止藏在别处）
  const bodyHas = await page.eval(`document.body.textContent.includes('王小明')`);
  ok('整页都找不到课表内容（E-08）', bodyHas === false);

  // --- 齿轮进设置 ---
  await page.click('#btnGear');
  await page.waitFor(`location.hash === '#/settings'`, { message: '进入设置' });
  ok('首页齿轮进入数据与设置', await page.eval(
    `document.querySelector('#pageTitle').textContent === '数据与设置'`));

  // --- 昨日结转在首页也提示（共用逻辑） ---
  await page.eval(`(async () => {
    const st = await import('/js/store.js');
    const db = await import('/js/db.js');
    const d = await import('/js/core/dates.js');
    const { uid } = await import('/js/util.js');
    const y = d.addDays(d.todayStr(), -1);
    await st.saveRecord('tasks', { id: uid(), date: y, title: '昨天的事', time: null, note: '',
      done: false, doneAt: null, sort: 0, createdAt: Date.now(),
      repeat: { type: 'none', weekdays: [], sourceId: null } });
    await db.remove('meta', 'lastOpenDate');
  })()`);
  await page.reload();
  await goto(page, '#/home');
  await page.waitFor(`document.querySelector('[data-carry="move"]') !== null`, { message: '首页结转提示' });
  ok('首页也能提示昨日未完成', true);

  await page.close();
  exitCode = report('M6');
} catch (err) {
  console.error('M6 测试异常：', err);
  exitCode = 1;
} finally {
  await shutdownApp();
}
process.exit(exitCode);
