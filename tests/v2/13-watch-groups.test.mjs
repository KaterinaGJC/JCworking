// 问题 13：追更区域添加区分「正在连载 / 已完结」板块
// 复现点：追更分两组标题；可手动标记完结/改回连载；集数追平总集数自动归入已完结；刷新持久化。
import { bootApp, shutdownApp, freshPage, goto, ok, eq, report } from '../lib.mjs';

let exitCode = 1;

try {
  await bootApp();
  const page = await freshPage();

  await goto(page, '#/fun');
  await page.waitFor(`document.querySelector('#funSeg') !== null`);
  await page.click('#funSeg [data-tab="watch"]');
  await new Promise((r) => setTimeout(r, 300));

  // 加一部追更（不设总集数 = 正在连载）
  await page.click('#fab');
  await page.waitFor(`document.querySelector('#s-name') !== null`, { message: '追更表单' });
  await page.type('#s-name', '连载中的番');
  await page.type('#s-current', '5');
  await page.click('.sheet .row .btn[data-i="1"]');
  await new Promise((r) => setTimeout(r, 400));

  const groups = await page.eval(
    `[...document.querySelectorAll('#funPanel .grouph')].map(h => h.textContent.trim())`);
  ok('有「正在连载」分组', groups.some((t) => t.includes('正在连载')), JSON.stringify(groups));
  ok('条目在「正在连载」下', await page.eval(`(() => {
    const h = [...document.querySelectorAll('#funPanel .grouph')].find(x => x.textContent.includes('正在连载'));
    return !!h && !!h.nextElementSibling && h.nextElementSibling.textContent.includes('连载中的番');
  })()`));

  // 手动标记完结
  await page.click('[data-end-show]');
  await new Promise((r) => setTimeout(r, 400));
  ok('标记完结后进入「已完结」分组', await page.eval(`(() => {
    const h = [...document.querySelectorAll('#funPanel .grouph')].find(x => x.textContent.includes('已完结'));
    return !!h && !!h.nextElementSibling && h.nextElementSibling.textContent.includes('连载中的番');
  })()`));
  eq('ended 字段已落库', await page.eval(`(async () =>
    (await import('/js/store.js')).state.shows[0].ended)()`), true);

  // 已完结里可以改回连载
  await page.click('[data-unend-show]');
  await new Promise((r) => setTimeout(r, 400));
  ok('改回连载后回到「正在连载」', await page.eval(`(() => {
    const h = [...document.querySelectorAll('#funPanel .grouph')].find(x => x.textContent.includes('正在连载'));
    return !!h && !!h.nextElementSibling && h.nextElementSibling.textContent.includes('连载中的番');
  })()`));

  // 集数追平总集数 → 自动已完结
  await page.click('[data-edit-show]');
  await page.waitFor(`document.querySelector('#s-total') !== null`);
  await page.type('#s-current', '12');
  await page.type('#s-total', '12');
  await page.click('.sheet .row .btn[data-i="1"]');
  await new Promise((r) => setTimeout(r, 400));
  ok('集数追平总集数自动归入「已完结」', await page.eval(`(() => {
    const h = [...document.querySelectorAll('#funPanel .grouph')].find(x => x.textContent.includes('已完结'));
    return !!h && !!h.nextElementSibling && h.nextElementSibling.textContent.includes('连载中的番');
  })()`));
  ok('已完结的条目不再显示 +1 集按钮', await page.eval(
    `!document.querySelector('[data-plus]')`));

  // 刷新持久化
  await page.reload();
  await goto(page, '#/fun');
  await page.click('#funSeg [data-tab="watch"]');
  await new Promise((r) => setTimeout(r, 400));
  ok('刷新后仍在「已完结」分组', await page.eval(`(() => {
    const h = [...document.querySelectorAll('#funPanel .grouph')].find(x => x.textContent.includes('已完结'));
    return !!h && !!h.nextElementSibling && h.nextElementSibling.textContent.includes('连载中的番');
  })()`));

  await page.close();
  exitCode = report('问题 13 · 追更分组');
} catch (err) {
  console.error('测试异常：', err);
  exitCode = 1;
} finally {
  await shutdownApp();
}
process.exit(exitCode);
