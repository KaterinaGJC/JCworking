// 修复项 01：今日计划顶栏的 ＋ 点了没反应（应该和右下角悬浮按钮一样能新增）
import { bootApp, shutdownApp, freshPage, goto, ok, eq, report } from '../lib.mjs';

let exitCode = 1;

try {
  await bootApp();
  const page = await freshPage();

  await goto(page, '#/plan');
  await page.waitFor(`document.querySelector('.plan-body') !== null`, { message: '计划页渲染' });

  // 顶栏 ＋ 必须可见
  ok('计划页顶栏 ＋ 可见', await page.eval(
    `!document.querySelector('#btnPlus').classList.contains('hidden')`));

  // 点它要能打开新增面板
  await page.click('#btnPlus');
  const opened = await page.eval(`document.querySelector('#f-title') !== null`);
  ok('点顶栏 ＋ 能打开新增面板', opened);

  // 保存后应该出现在今天
  await page.type('#f-title', '顶栏加的事');
  await page.click('.sheet .row .btn[data-i="1"]');
  await new Promise((r) => setTimeout(r, 450));
  ok('通过顶栏 ＋ 新建的条目出现在列表', await page.eval(
    `[...document.querySelectorAll('.titem .t')].some(e => e.textContent.includes('顶栏加的事'))`));

  // 右下角悬浮按钮仍然可用
  await page.click('#fab');
  ok('悬浮按钮功能未受影响', await page.eval(`document.querySelector('#f-title') !== null`));
  await page.eval(`document.querySelector('.sheet-mask')?.remove()`);

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
