// 验证项 22：首页月历 · 心情月度回顾 · 卡片堆叠纸片 · 课表 ＋ 隐藏 · 底部标签减负
import { bootApp, shutdownApp, freshPage, goto, ok, eq, report } from '../lib.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let exitCode = 1;

try {
  await bootApp();
  const page = await freshPage();

  // 造数据：今天有任务、前几天有心情
  await page.eval(`(async () => {
    const st = await import('/js/store.js');
    const d = await import('/js/core/dates.js');
    const mood = await import('/js/core/mood.js');
    const t = d.todayStr();
    await st.saveMany('tasks', [{ id: 'c1', date: t, title: '备课', time: '09:00', sort: 1,
      done: false, doneAt: null, note: '', repeat: { type: 'none', weekdays: [], sourceId: null },
      createdAt: Date.now() }]);
    await mood.setMood(t, 'calm');
    const back = (n) => { const x = new Date(); x.setDate(x.getDate() - n);
      return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
    await mood.setMood(back(2), 'happy');
    await mood.setMood(back(4), 'tired');
  })()`);
  await page.reload();
  await page.waitFor(`document.querySelector('.cal-card') !== null`, { message: '月历卡' });
  await sleep(600);

  // ---------- 1. 月历结构 ----------
  const cells = await page.eval(`document.querySelectorAll('.cal-card .cal-d').length`);
  eq('月历有 42 个格子（6 周）', cells, 42);
  const todayCells = await page.eval(`document.querySelectorAll('.cal-card .cal-d.today').length`);
  eq('今天那一格有高亮', todayCells, 1);
  const dots = await page.eval(`document.querySelectorAll('.cal-card .mdot').length`);
  ok('有心情的日期打了彩色小点', dots >= 3, String(dots));

  const title0 = await page.eval(`document.querySelector('.cal-title b').textContent`);
  ok('月份标题存在', /月$/.test(title0), title0);

  // ---------- 2. 翻月 / 回到今天 ----------
  await page.click('[data-cal-next]');
  await sleep(250);
  const title1 = await page.eval(`document.querySelector('.cal-title b').textContent`);
  ok('点"下个月"能翻页', title1 !== title0, `${title0} → ${title1}`);
  const bodyText = await page.eval(`document.querySelector('.cal-card').textContent`);
  ok('翻到别的月份时，本月心情统计显示"还没记心情"或数字',
    bodyText.includes('还没记心情') || bodyText.includes('开心'), 'ok');

  await page.click('[data-cal-today]');
  await sleep(250);
  const title2 = await page.eval(`document.querySelector('.cal-title b').textContent`);
  eq('点"今天"回到本月', title2, title0);

  // ---------- 3. 点日期 → 计划卡切到那天 ----------
  const targetDate = await page.eval(`(() => {
    const cells = [...document.querySelectorAll('.cal-card .cal-d')].filter(c => !c.classList.contains('out'));
    const last = cells[cells.length - 1];
    return last.dataset.calDay;
  })()`);
  await page.click(`[data-cal-day="${targetDate}"]`);
  await sleep(700);
  const planDate = await page.eval(`(async () => (await import('/js/pages/plan.js')).getPlanDate())()`);
  eq('点月历某天，计划卡跟着切到那天', planDate, targetDate);
  const picked = await page.eval(`document.querySelectorAll('.cal-card .cal-d.picked').length`);
  ok('被选中的那天有描边标记', picked >= 1, String(picked));

  // ---------- 4. 本月心情统计 ----------
  const stats = await page.eval(`[...document.querySelectorAll('.cal-foot .ms')].map(e => e.textContent.trim())`);
  ok('月历底部有本月心情小结', stats.length > 0, stats.join(' / '));
  ok('小结里带次数', stats.some((s) => /\d/.test(s)), stats.join(' / '));

  // ---------- 5. 课表：＋ 默认隐藏，但整格可点 ----------
  await goto(page, '#/schedule');
  await page.waitFor(`document.querySelector('.tt-add') !== null`, { message: '课表' });
  await sleep(500);
  const addOpacity = await page.eval(`getComputedStyle(document.querySelector('.tt-add')).opacity`);
  ok('空格子里的 ＋ 默认不可见（减噪）', Number(addOpacity) < 0.1, addOpacity);

  await page.click('.tt-cell:not(.has-lesson)');
  await sleep(600);
  const sheetOpen = await page.eval(`document.querySelector('.sheet, .fullscreen-editor') !== null`);
  ok('点空格子的任意位置都能加课', sheetOpen === true);

  // 关掉面板，免得影响后面的检查
  await page.eval(`document.querySelector('.sheet-mask')?.remove(); document.querySelector('.fullscreen-editor')?.remove();`);

  // ---------- 6. 底部标签减负：页码只出现在选中项 ----------
  await goto(page, '#/home');
  await page.waitFor(`document.querySelector('.home-body') !== null`);
  await sleep(500);
  const tabBefore = await page.eval(`(() => {
    const on = document.querySelector('#tabbar .tab.on');
    const off = [...document.querySelectorAll('#tabbar .tab')].find(t => !t.classList.contains('on'));
    return {
      onNum: getComputedStyle(on, '::before').opacity,
      offNum: getComputedStyle(off, '::before').opacity,
      onBg: getComputedStyle(on).backgroundColor,
      offBg: getComputedStyle(off).backgroundColor,
    };
  })()`);
  ok('选中标签的页码可见', Number(tabBefore.onNum) > 0.4, tabBefore.onNum);
  ok('未选中标签的页码隐藏（减负）', Number(tabBefore.offNum) < 0.1, tabBefore.offNum);
  ok('标签不再有整块底色', /rgba\(0, 0, 0, 0\)|transparent/.test(tabBefore.onBg), tabBefore.onBg);

  // ---------- 7. 卡片堆叠纸片 ----------
  const stack = await page.eval(`(() => {
    const cs = getComputedStyle(document.querySelector('.page'), '::before');
    return { content: cs.content, zIndex: cs.zIndex, anim: cs.animationName };
  })()`);
  ok('新页面下方压着一张"上一张纸"（伪元素）', stack.content !== 'none', JSON.stringify(stack));
  ok('这张纸在内容之下（不挡点击）', stack.zIndex === '-1', stack.zIndex);

  await page.close();
  exitCode = report('验证项 22 · 月历与减负');
} catch (err) {
  console.error('测试异常：', err);
  exitCode = 1;
} finally {
  await shutdownApp();
}
process.exit(exitCode);
