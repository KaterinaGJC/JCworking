// 修复项 01：今日计划顶栏的 ＋ 点了没反应（应该和右下角悬浮按钮一样能新增）
import { bootApp, shutdownApp, freshPage, goto, ok, eq, report } from '../lib.mjs';

let exitCode = 1;

try {
  await bootApp();
  const page = await freshPage();

  // v3 起「今日计划」并入首页，新增入口是计划卡头部的 ＋（不再是顶栏 ＋ / 悬浮按钮）
  await goto(page, '#/home');
  await page.waitFor(`document.querySelector('[data-card="plan"] .plan-body') !== null`,
    { message: '首页计划区渲染' });

  // 卡片头 ＋ 必须可见
  ok('首页计划卡新增按钮可见', await page.eval(
    `document.querySelector('[data-card="plan"] [data-plan-add]') !== null`));

  // 点它要能打开新增面板
  await page.click('[data-card="plan"] [data-plan-add]');
  const opened = await page.eval(`document.querySelector('#f-title') !== null`);
  ok('点新增按钮能打开面板', opened);

  // 保存后应该出现在今天
  await page.type('#f-title', '顶栏加的事');
  await page.click('.sheet .row .btn[data-i="1"]');
  await new Promise((r) => setTimeout(r, 450));
  ok('通过新增按钮新建的条目出现在列表', await page.eval(
    `[...document.querySelectorAll('.titem .t')].some(e => e.textContent.includes('顶栏加的事'))`));

  // 首页不该有全局悬浮新增按钮（新增走卡片头 ＋）
  await page.eval(`document.querySelector('.sheet-mask')?.remove()`);
  ok('首页无全局悬浮按钮', await page.eval(`document.querySelector('#fab').hidden === true`));

  // 娱乐页的顶栏 ＋ 也要能用（同一类问题）
  await goto(page, '#/fun');
  await page.waitFor(`document.querySelector('.fun-body') !== null`, { message: '娱乐页' });
  ok('娱乐页顶栏 ＋ 可见', await page.eval(
    `!document.querySelector('#btnPlus').classList.contains('hidden')`));
  await page.click('#btnPlus');
  ok('娱乐页点顶栏 ＋ 打开的是游戏表单', await page.eval(
    `document.querySelector('#g-name') !== null`));
  await page.eval(`document.querySelector('.sheet-mask')?.remove()`);

  // 换页后顶栏 ＋ 的处理器不能残留（在课表页点它不该再打开游戏表单）
  await goto(page, '#/schedule');
  await page.waitFor(`document.querySelector('.schedule-body') !== null`);
  const residual = await page.eval(`(() => {
    const btn = document.querySelector('#btnPlus');
    btn.click();
    return { sheet: !!document.querySelector('.sheet-mask'),
             game: !!document.querySelector('#g-name'),
             title: !!document.querySelector('#f-title') };
  })()`);
  eq('课表页不会残留其它页面的 ＋ 行为', residual.game || residual.title, false);

  await page.close();
  exitCode = report('修复项 01 · 顶栏 ＋');
} catch (err) {
  console.error('测试异常：', err);
  exitCode = 1;
} finally {
  await shutdownApp();
}
process.exit(exitCode);
