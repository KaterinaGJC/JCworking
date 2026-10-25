// 问题 12：游戏库改成 Steam 风格卡片视图，卡片底图（封面）可自主编辑
// 复现点：游戏库应为网格卡片（每张有封面区），编辑表单可选封面图，封面存 blobs 并持久化。
import path from 'node:path';
import { bootApp, shutdownApp, freshPage, goto, ok, eq, report } from '../lib.mjs';

let exitCode = 1;
const IMG = path.resolve('app/icons/icon-192.png');

async function pickImage(page, clickSelector, file = IMG) {
  await page.send('Page.setInterceptFileChooserDialog', { enabled: true }).catch(() => {});
  const chooser = new Promise((resolve) => {
    page.on((m) => { if (m.method === 'Page.fileChooserOpened') resolve(m.params); });
  });
  await page.click(clickSelector);
  const info = await Promise.race([
    chooser,
    new Promise((r) => setTimeout(() => r(null), 4000)),
  ]);
  if (!info) throw new Error(`没有弹出文件选择框：${clickSelector}`);
  await page.send('DOM.setFileInputFiles', { files: [file], backendNodeId: info.backendNodeId });
  await new Promise((r) => setTimeout(r, 200));
}

try {
  await bootApp();
  const page = await freshPage();

  await goto(page, '#/fun');
  await page.waitFor(`document.querySelector('#funSeg') !== null`);

  // 加一款游戏
  await page.click('#fab');
  await page.waitFor(`document.querySelector('#g-name') !== null`, { message: '游戏表单' });
  await page.type('#g-name', '星露谷');
  await page.click('.sheet .row .btn[data-i="1"]'); // 保存
  await new Promise((r) => setTimeout(r, 450));

  // --- Steam 风格网格卡片 ---
  ok('游戏库是卡片网格容器', await page.eval(
    `!!document.querySelector('.gcards')`));
  ok('卡片有封面区域', await page.eval(
    `!!document.querySelector('.gcard .gcover')`));
  ok('无封面时显示占位（首字/渐变）', await page.eval(`(() => {
    const c = document.querySelector('.gcard .gcover');
    return c && c.classList.contains('ph');
  })()`));
  const gridCols = await page.eval(`getComputedStyle(document.querySelector('.gcards')).gridTemplateColumns.split(' ').length`);
  ok('网格为多列（Steam 风格并排）', gridCols >= 2, `cols=${gridCols}`);

  // --- 封面编辑入口 ---
  await page.click('[data-edit-game]');
  await page.waitFor(`document.querySelector('#g-cover') !== null`, { message: '封面编辑入口' });
  ok('编辑表单有「换封面」入口', true);
  ok('编辑表单仍能改基础信息（#g-name 保留）', await page.eval(
    `!!document.querySelector('#g-name')`));

  // 选封面图 → 保存
  await pickImage(page, '#g-cover');
  await page.waitFor(`document.querySelector('#g-cover-prev img') !== null`,
    { message: '封面预览出现' });
  ok('选图后表单内出现封面预览', true);
  await page.click('.sheet .row .btn[data-i="1"]');
  await new Promise((r) => setTimeout(r, 450));

  // --- 数据落库 ---
  const data = await page.eval(`(async () => {
    const st = await import('/js/store.js');
    const g = st.state.games[0];
    return { coverId: g.coverId || null, blobs: st.state.blobs.length,
             hasData: (st.state.blobs[0]?.dataUrl || '').startsWith('data:image/') };
  })()`);
  ok('游戏记录存了 coverId', !!data.coverId, JSON.stringify(data));
  eq('封面图进了 blobs 表', data.blobs, 1);
  ok('blobs 存的是 dataURL', data.hasData);

  // --- 卡片渲染出封面 ---
  ok('卡片封面区显示背景图', await page.eval(`(() => {
    const c = document.querySelector('.gcard .gcover');
    return c && !c.classList.contains('ph') && (c.style.backgroundImage || '').includes('data:image/');
  })()`));

  // --- 刷新持久化 ---
  await page.reload();
  await goto(page, '#/fun');
  await page.waitFor(`document.querySelector('.gcard .gcover') !== null`, { message: '刷新后卡片' });
  ok('刷新后封面仍在', await page.eval(`(() => {
    const c = document.querySelector('.gcard .gcover');
    return (c.style.backgroundImage || '').includes('data:image/');
  })()`));

  // --- 旧功能未回归：状态流转、评分星级 ---
  await page.click('[data-move][data-to="cleared"]');
  await new Promise((r) => setTimeout(r, 400));
  ok('通关流转仍可用', await page.eval(`(async () =>
    (await import('/js/store.js')).state.games[0].status === 'cleared')()`));

  await page.close();
  exitCode = report('问题 12 · 游戏库 Steam 卡片与封面');
} catch (err) {
  console.error('测试异常：', err);
  exitCode = 1;
} finally {
  await shutdownApp();
}
process.exit(exitCode);
