// 问题 14：体验书写挪移到游戏库/活动/追更的具体条目下
// 复现点：娱乐页不再有独立「体验」分区；点击游戏/活动/追更条目打开详情面板，
// 面板内可书写体验/感受，体验与条目关联并只在对应条目详情里显示。
import { bootApp, shutdownApp, freshPage, goto, ok, eq, report } from '../lib.mjs';

let exitCode = 1;

try {
  await bootApp();
  const page = await freshPage();

  await goto(page, '#/fun');
  await page.waitFor(`document.querySelector('#funSeg') !== null`);

  // --- 分区只剩三个 ---
  eq('娱乐页分区为 游戏库/活动/追更', await page.eval(
    `[...document.querySelectorAll('#funSeg button')].map(b => b.textContent)`),
  ['游戏库', '活动', '追更']);

  // --- 游戏条目详情可写体验 ---
  await page.click('#fab');
  await page.waitFor(`document.querySelector('#g-name') !== null`, { message: '游戏表单' });
  await page.type('#g-name', '游戏甲');
  await page.click('.sheet .row .btn[data-i="1"]');
  await new Promise((r) => setTimeout(r, 400));

  await page.click('.gcard .gcover');
  await page.waitFor(`document.querySelector('#item-detail') !== null`, { message: '游戏详情面板' });
  ok('游戏卡片点击打开详情面板', true);
  const actLabels = await page.eval(
    `[...document.querySelectorAll('.sheet .row .btn')].map(b => b.textContent)`);
  ok('详情面板有「写体验」', actLabels.some((t) => t.includes('写体验')), JSON.stringify(actLabels));
  ok('详情面板有「编辑」', actLabels.some((t) => t.includes('编辑')), JSON.stringify(actLabels));

  await page.click('.sheet .row .btn[data-i="2"]'); // 写体验
  await page.waitFor(`document.querySelector('.fullscreen-editor') !== null`, { message: '全屏编辑器' });
  ok('编辑器标题预填条目名', await page.eval(
    `document.querySelector('#fe-title').value`) === '游戏甲');
  await page.type('#fe-body', '手感不错，剧情佳');
  await page.click('#fe-save');
  await new Promise((r) => setTimeout(r, 500));

  const expRec = await page.eval(`(async () => {
    const st = await import('/js/store.js');
    const e = st.state.experiences[0];
    const g = st.state.games.find(x => x.name === '游戏甲');
    return e ? { sourceType: e.sourceType, sourceId: e.sourceId, gameId: g?.id } : null;
  })()`);
  ok('体验记录了来源（游戏）', expRec?.sourceType === 'game' && expRec?.sourceId === expRec?.gameId,
    JSON.stringify(expRec));

  await page.waitFor(`document.querySelector('#item-detail') !== null`, { message: '详情面板重开' });
  ok('体验显示在该游戏详情里', await page.eval(`(() => {
    const d = document.querySelector('#item-detail');
    return !!d.querySelector('.ecard') && d.textContent.includes('手感不错');
  })()`));

  // --- 隔离：另一个游戏的详情不显示这条体验 ---
  await page.click('.sheet .row .btn[data-i="0"]'); // 关闭详情
  await new Promise((r) => setTimeout(r, 300));
  await page.eval(`(async () => {
    const st = await import('/js/store.js');
    const { uid } = await import('/js/util.js');
    await st.saveRecord('games', { id: uid(), name: '游戏乙', platform: 'PC', status: 'wish', rating: 0, note: '' });
  })()`);
  await goto(page, '#/home');
  await goto(page, '#/fun');
  await page.waitFor(`document.querySelectorAll('.gcard').length >= 2`);
  await page.eval(`(() => {
    const card = [...document.querySelectorAll('.gcard')].find(c => c.textContent.includes('游戏乙'));
    card.querySelector('.gcover').click();
  })()`);
  await page.waitFor(`document.querySelector('#item-detail') !== null`, { message: '乙的详情' });
  ok('另一游戏详情不显示甲的体验', await page.eval(`(() => {
    const d = document.querySelector('#item-detail');
    return !d.querySelector('.ecard') || !d.textContent.includes('手感不错');
  })()`));

  // --- 活动条目详情可写体验 ---
  await page.click('.sheet .row .btn[data-i="0"]'); // 关闭详情
  await new Promise((r) => setTimeout(r, 300));
  await page.click('#funSeg [data-tab="act"]');
  await new Promise((r) => setTimeout(r, 300));
  await page.click('#fab');
  await page.waitFor(`document.querySelector('#a-title') !== null`, { message: '活动表单' });
  await page.type('#a-title', '活动丙');
  await page.click('.sheet .row .btn[data-i="1"]');
  await new Promise((r) => setTimeout(r, 400));
  await page.click('.acard .amain');
  await page.waitFor(`document.querySelector('#item-detail') !== null`, { message: '活动详情面板' });
  ok('活动卡片点击打开详情面板', true);

  // --- 追更条目详情可写体验 ---
  await page.click('.sheet .row .btn[data-i="0"]'); // 关闭详情
  await new Promise((r) => setTimeout(r, 300));
  await page.click('#funSeg [data-tab="watch"]');
  await new Promise((r) => setTimeout(r, 300));
  await page.click('#fab');
  await page.waitFor(`document.querySelector('#s-name') !== null`, { message: '追更表单' });
  await page.type('#s-name', '番丁');
  await page.click('.sheet .row .btn[data-i="1"]');
  await new Promise((r) => setTimeout(r, 400));
  await page.click('.trow .tmain');
  await page.waitFor(`document.querySelector('#item-detail') !== null`, { message: '追更详情面板' });
  ok('追更条目点击打开详情面板', true);
  const watchLabels = await page.eval(
    `[...document.querySelectorAll('.sheet .row .btn')].map(b => b.textContent)`);
  ok('追更详情也有「写体验」', watchLabels.some((t) => t.includes('写体验')), JSON.stringify(watchLabels));

  await page.close();
  exitCode = report('问题 14 · 体验入口下沉');
} catch (err) {
  console.error('测试异常：', err);
  exitCode = 1;
} finally {
  await shutdownApp();
}
process.exit(exitCode);
