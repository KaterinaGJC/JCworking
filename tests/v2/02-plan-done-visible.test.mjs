// 修复项 02：计划主界面要能同时看到「未完成」和「已完成」（已完成默认展开、可收起）
import { bootApp, shutdownApp, freshPage, goto, ok, eq, report } from '../lib.mjs';

let exitCode = 1;

const seed = (page) => page.eval(`(async () => {
  const st = await import('/js/store.js');
  const d = await import('/js/core/dates.js');
  const { uid } = await import('/js/util.js');
  const today = d.todayStr();
  const mk = (title, time, done, sort) => ({
    id: uid(), date: today, title, time, note: '', done,
    doneAt: done ? Date.now() : null, sort, createdAt: Date.now(),
    repeat: { type: 'none', weekdays: [], sourceId: null },
  });
  await st.saveMany('tasks', [
    mk('还没做的A', null, false, 0),
    mk('还没做的B', '14:00', false, 10),
    mk('已经做完的C', null, true, 20),
    mk('已经做完的D', '09:00', true, 30),
  ]);
})()`);

const visible = (page, text) => page.eval(`(() => {
  const el = [...document.querySelectorAll('.titem')].find(x => x.textContent.includes(${JSON.stringify(text)}));
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.height > 0 && el.offsetParent !== null;
})()`);

try {
  await bootApp();
  const page = await freshPage();
  await seed(page);
  await goto(page, '#/plan');
  await page.waitFor(`document.querySelector('.plan-body') !== null`, { message: '计划页渲染' });

  ok('已完成区域默认展开（不过滤成只剩未完成）', await page.eval(
    `document.querySelector('#doneGroup')?.classList.contains('open')`));

  ok('未完成条目可见', await visible(page, '还没做的A'));
  ok('已完成条目同屏可见（不点开就能看到）', await visible(page, '已经做完的C'));
  ok('两者同时出现在同一屏', (await visible(page, '还没做的B')) && (await visible(page, '已经做完的D')));

  eq('已完成计数正确', await page.eval(
    `document.querySelector('#doneGroup .h span').textContent.trim()`), '已完成 · 2 项');

  // 可以收起
  await page.click('#doneGroup .h');
  await new Promise((r) => setTimeout(r, 200));
  ok('点标题可以收起', await page.eval(
    `!document.querySelector('#doneGroup').classList.contains('open')`));
  ok('收起后已完成条目不可见', !(await visible(page, '已经做完的C')));

  // 再点展开
  await page.click('#doneGroup .h');
  await new Promise((r) => setTimeout(r, 200));
  ok('再点可以重新展开', await visible(page, '已经做完的C'));

  // 勾选一条未完成 → 它应立刻出现在已展开的已完成区
  await page.eval(`[...document.querySelectorAll('.titem')]
    .find(x => x.textContent.includes('还没做的A')).querySelector('.cbox').click()`);
  await new Promise((r) => setTimeout(r, 450));
  ok('新完成的条目直接出现在已完成区（不需要再点开）', await visible(page, '还没做的A'));
  eq('计数随之更新', await page.eval(
    `document.querySelector('#doneGroup .h span').textContent.trim()`), '已完成 · 3 项');

  await page.close();
  exitCode = report('修复项 02 · 已完成同屏');
} catch (err) {
  console.error('测试异常：', err);
  exitCode = 1;
} finally {
  await shutdownApp();
}
process.exit(exitCode);
