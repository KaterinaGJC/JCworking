// M7 · 打磨项：说明卡、备份提醒、测试数据生成器、性能
import { bootApp, shutdownApp, freshPage, goto, ok, eq, report } from './lib.mjs';

let exitCode = 1;

try {
  await bootApp();
  const page = await freshPage();

  // --- T52 首次使用说明卡 ---
  await goto(page, '#/home');
  await page.waitFor(`document.querySelector('.tipcard') !== null`, { message: '首页说明卡' });
  ok('首页首次进入有说明卡', await page.eval(
    `document.querySelector('.tipcard').dataset.tipcard === 'home'`));
  await page.click('[data-tip-close]');
  ok('可以关闭说明卡', await page.eval(`document.querySelector('.tipcard') === null`));

  for (const [hash, key] of [['#/plan', 'plan'], ['#/schedule', 'schedule'], ['#/fun', 'fun'], ['#/memo', 'memo']]) {
    await goto(page, hash);
    await new Promise((r) => setTimeout(r, 350));
    ok(`「${key}」首次进入有说明卡`, await page.eval(
      `document.querySelector('[data-tipcard="${key}"]') !== null`));
  }

  await page.reload();
  await goto(page, '#/home');
  await new Promise((r) => setTimeout(r, 400));
  ok('说明卡只出现一次（刷新后不再出现）', await page.eval(
    `document.querySelector('.tipcard') === null`));

  // --- T55 备份提醒 ---
  await goto(page, '#/settings');
  await page.waitFor(`document.querySelector('.sgroup') !== null`);
  ok('没有数据时不提示备份', await page.eval(
    `document.querySelector('[data-backup-hint]') === null`));

  await page.eval(`(async () => {
    await window.__jc.seed({ notes: 3, tasks: 1, lessons: 0, games: 0, activities: 0, shows: 0, experiences: 0 });
  })()`);
  await goto(page, '#/home');
  await goto(page, '#/settings');
  await new Promise((r) => setTimeout(r, 350));
  ok('有数据且没备份过时提示（T55）', await page.eval(
    `(document.querySelector('[data-backup-hint]')?.textContent || '').includes('还没备份过')`));

  await page.eval(`(async () => {
    const db = await import('/js/db.js');
    await db.put('meta', { key: 'lastBackupAt', value: Date.now() - 9 * 86400000 });
  })()`);
  await page.reload();
  await goto(page, '#/settings');
  await new Promise((r) => setTimeout(r, 400));
  ok('超过 7 天提示未备份（T55）', await page.eval(
    `(document.querySelector('[data-backup-hint]')?.textContent || '').includes('天没备份')`));

  // 导出后提醒消失
  await page.click('[data-act="export"]');
  await new Promise((r) => setTimeout(r, 600));
  await goto(page, '#/home');
  await goto(page, '#/settings');
  await new Promise((r) => setTimeout(r, 400));
  ok('导出后提醒消失', await page.eval(`document.querySelector('[data-backup-hint]') === null`));
  ok('导出后显示上次备份时间', await page.eval(
    `document.querySelector('[data-act="export"]').textContent.includes('上次')`));

  // --- T54 测试数据生成器 ---
  const seeded = await page.eval(`(async () => window.__jc.seed({ notes: 100, tasks: 30, lessons: 8 }))()`);
  ok('生成器灌入 100 条便签', seeded.notes >= 100, JSON.stringify(seeded));
  ok('生成器灌入课次', seeded.lessons >= 8);

  // 设置页连点版本号 5 次也能触发
  const beforeHidden = await page.eval(`(async () => (await import('/js/store.js')).state.notes.length)()`);
  for (let i = 0; i < 5; i++) await page.click('[data-act="version"]');
  await new Promise((r) => setTimeout(r, 700));
  const afterHidden = await page.eval(`(async () => (await import('/js/store.js')).state.notes.length)()`);
  ok('连点版本号 5 次也能灌数据（T54）', afterHidden > beforeHidden, `${beforeHidden} → ${afterHidden}`);

  // --- I-02 性能压测 ---
  const perf = await page.eval(`(async () => {
    const st = await import('/js/store.js');
    const d = await import('/js/core/dates.js');
    const { uid } = await import('/js/util.js');
    const today = d.todayStr();
    const tasks = Array.from({ length: 500 }, (_, i) => ({
      id: uid(), date: today, title: '压测任务 ' + i, time: i % 2 ? '09:00' : null, note: '',
      done: false, doneAt: null, sort: i, createdAt: Date.now(),
      repeat: { type: 'none', weekdays: [], sourceId: null },
    }));
    await st.saveMany('tasks', tasks);
    const t0 = performance.now();
    location.hash = '#/plan';
    await new Promise(r => setTimeout(r, 60));
    while (!document.querySelector('.plan-body')) await new Promise(r => setTimeout(r, 20));
    const planMs = performance.now() - t0;

    const t1 = performance.now();
    location.hash = '#/memo';
    await new Promise(r => setTimeout(r, 60));
    while (!document.querySelector('.memo-body')) await new Promise(r => setTimeout(r, 20));
    const memoMs = performance.now() - t1;

    const t2 = performance.now();
    location.hash = '#/home';
    await new Promise(r => setTimeout(r, 60));
    while (!document.querySelector('.home-body')) await new Promise(r => setTimeout(r, 20));
    const homeMs = performance.now() - t2;

    return { planMs: Math.round(planMs), memoMs: Math.round(memoMs), homeMs: Math.round(homeMs),
             tasks: st.state.tasks.length, notes: st.state.notes.length };
  })()`);
  ok('500 条待办下计划页 1.5 秒内可交互（I-02）', perf.planMs < 1500, JSON.stringify(perf));
  ok('200 条便签下备忘页 1.5 秒内可交互（I-02）', perf.memoMs < 1500, JSON.stringify(perf));
  ok('首页 1.5 秒内可交互（I-02）', perf.homeMs < 1500, JSON.stringify(perf));

  // 滚动不报错、无异常
  const errs = await page.eval(`(async () => {
    window.__errs = [];
    window.addEventListener('error', e => window.__errs.push(String(e.message)));
    await new Promise(r => setTimeout(r, 200));
    return window.__errs.length;
  })()`);
  eq('压测过程没有页面错误（I-03）', errs, 0);

  await page.close();
  exitCode = report('M7');
} catch (err) {
  console.error('M7 测试异常：', err);
  exitCode = 1;
} finally {
  await shutdownApp();
}
process.exit(exitCode);
