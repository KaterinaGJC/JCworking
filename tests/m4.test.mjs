// M4 · 游戏娱乐
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

  await goto(page, '#/fun');
  await page.waitFor(`document.querySelector('.fun-body') !== null`, { message: '娱乐页渲染' });

  // --- 三个分区都在（体验并入条目详情）---
  eq('三个分区都在', await page.eval(
    `[...document.querySelectorAll('#funSeg button')].map(b => b.textContent)`),
  ['游戏库', '活动', '追更']);

  // --- F-01 游戏库：新增 + 状态流转 ---
  await page.click('#fab');
  await page.waitFor(`document.querySelector('#g-name') !== null`, { message: '游戏表单' });
  await page.type('#g-name', '明日方舟');
  await page.click('#g-platform [data-p="手机"]');
  await page.click('#g-status [data-s="wish"]');
  await page.click('#g-rating [data-r="5"]');
  await page.type('#g-note', '主线 14 章');
  await page.click('.sheet .row .btn[data-i="1"]');
  await new Promise((r) => setTimeout(r, 400));

  ok('游戏出现在「想玩」分组', await page.eval(`(() => {
    const g = [...document.querySelectorAll('.grouph')].find(h => h.textContent.includes('想玩'));
    return !!g;
  })()`));
  ok('显示评分星级', await page.eval(`!!document.querySelector('.gcard .stars')`));

  await page.click('[data-move][data-to="playing"]');
  await new Promise((r) => setTimeout(r, 350));
  ok('点「开始玩」进入在玩（F-01）', await page.eval(`(() => {
    const h = [...document.querySelectorAll('.grouph')].find(x => x.textContent.includes('在玩'));
    const card = h?.nextElementSibling;
    return !!card && card.textContent.includes('明日方舟');
  })()`));

  await page.click('[data-move][data-to="cleared"]');
  await new Promise((r) => setTimeout(r, 350));
  const clearedOk = await page.eval(`(async () => {
    const st = await import('/js/store.js');
    return st.state.games[0]?.status;
  })()`);
  eq('点「通关了」状态变为 cleared（F-01）', clearedOk, 'cleared');

  // --- F-02 活动：倒计时与分组 ---
  await page.click('#funSeg [data-tab="act"]');
  await new Promise((r) => setTimeout(r, 300));

  await seed(page, `
    const today = d.todayStr();
    await st.saveRecord('activities', { id: uid(), game: '明日方舟', title: '危机合约',
      due: d.addDays(today, 1), note: '', done: false, createdAt: Date.now() });
    await st.saveRecord('activities', { id: uid(), game: '无期迷途', title: '秋日签到',
      due: d.addDays(today, 10), note: '', done: false, createdAt: Date.now() });
    await st.saveRecord('activities', { id: uid(), game: '老活动', title: '周年礼',
      due: d.addDays(today, -2), note: '', done: false, createdAt: Date.now() });
  `);
  await goto(page, '#/home');
  await goto(page, '#/fun');
  await page.click('#funSeg [data-tab="act"]');
  await new Promise((r) => setTimeout(r, 350));

  ok('出现「即将到期」分组（F-02）', await page.eval(`(() => {
    const h = [...document.querySelectorAll('.grouph')].find(x => x.textContent.includes('即将到期'));
    return !!h;
  })()`));
  const countdown = await page.eval(`(() => {
    const card = [...document.querySelectorAll('.acard')].find(c => c.textContent.includes('危机合约'));
    return card ? { text: card.querySelector('.countdown').textContent,
                    cls: card.querySelector('.countdown').className } : null;
  })()`);
  ok('截止 1 天显示「还剩 1 天」并标红（F-02）',
    countdown?.text === '还剩 1 天' && countdown.cls.includes('urgent'), JSON.stringify(countdown));
  ok('已过期活动显示已结束', await page.eval(`(() => {
    const card = [...document.querySelectorAll('.acard')].find(c => c.textContent.includes('周年礼'));
    return card?.querySelector('.countdown').textContent.trim() === '已结束';
  })()`));

  // 标记完成
  await page.eval(`[...document.querySelectorAll('.acard')]
    .find(c => c.textContent.includes('秋日签到')).querySelector('[data-finish-act]').click()`);
  await new Promise((r) => setTimeout(r, 350));
  eq('标记完成后移出进行中（F-02）', await page.eval(`(async () => {
    const st = await import('/js/store.js');
    return st.state.activities.filter(a => a.done).length;
  })()`), 1);

  // --- F-03 / F-04 追更 ---
  await page.click('#funSeg [data-tab="watch"]');
  await new Promise((r) => setTimeout(r, 300));
  await page.click('#fab');
  await page.waitFor(`document.querySelector('#s-name') !== null`, { message: '追更表单' });
  await page.type('#s-name', '葬送的芙莉莲');
  await page.type('#s-current', '8');
  await page.type('#s-total', '28');
  await page.click('.sheet .row .btn[data-i="1"]');
  await new Promise((r) => setTimeout(r, 400));

  ok('追更条目出现', await page.eval(`[...document.querySelectorAll('.trow .tn')]
    .some(e => e.textContent.includes('芙莉莲'))`));
  ok('今天更新的带「今天」标记（F-04）', await page.eval(`(() => {
    const n = [...document.querySelectorAll('.trow')].find(r => r.textContent.includes('芙莉莲'));
    return !!n?.querySelector('.today-mark');
  })()`));

  await page.click('[data-plus]');
  await new Promise((r) => setTimeout(r, 350));
  eq('点 +1 集后集数 +1（F-03）', await page.eval(`(async () => {
    const st = await import('/js/store.js');
    return st.state.shows[0]?.current;
  })()`), 9);
  ok('界面显示更新后的集数', await page.eval(`[...document.querySelectorAll('.trow .td')]
    .some(e => e.textContent.includes('看到第 9 集'))`));

  await page.reload();
  await goto(page, '#/fun');
  await page.click('#funSeg [data-tab="watch"]');
  await new Promise((r) => setTimeout(r, 400));
  eq('刷新后集数仍是 9（F-03）', await page.eval(`(async () => {
    const st = await import('/js/store.js');
    return st.state.shows[0]?.current;
  })()`), 9);

  // --- F-05 体验记录长文（v2.1：体验写在具体条目下）---
  await page.click('#funSeg [data-tab="lib"]');
  await new Promise((r) => setTimeout(r, 300));
  await page.click('.gcard .gcover');
  await page.waitFor(`document.querySelector('#item-detail') !== null`, { message: '条目详情' });
  await page.click('.sheet .row .btn[data-i="2"]'); // 写体验
  await page.waitFor(`document.querySelector('.fullscreen-editor') !== null`, { message: '全屏编辑器' });
  await page.type('#fe-title', '星露谷物语');
  await page.click('#fe-type [data-t="game"]');
  await page.click('#fe-rating [data-r="5"]');
  const longBody = '一百二十小时之后终于把温室修起来了。'.repeat(40);
  await page.type('#fe-body', longBody);
  await page.type('#fe-progress', '已通关');
  await page.click('#fe-save');
  await new Promise((r) => setTimeout(r, 450));

  ok('体验记录出现在列表', await page.eval(`[...document.querySelectorAll('.ecard .en')]
    .some(e => e.textContent.includes('星露谷'))`));
  const bodyLen = await page.eval(`(async () => {
    const st = await import('/js/store.js');
    return st.state.experiences[0]?.body?.length ?? 0;
  })()`);
  ok('长文完整保存（F-05）', bodyLen === longBody.length, `${bodyLen} / ${longBody.length}`);
  ok('列表里正文做了截断显示', await page.eval(`(() => {
    const card = document.querySelector('.ecard .eb');
    if (!card) return false;
    const style = getComputedStyle(card);
    return style.webkitLineClamp === '3' || style.overflow === 'hidden';
  })()`));

  // 点开可再次编辑
  await page.click('.ecard');
  await page.waitFor(`document.querySelector('.fullscreen-editor') !== null`);
  ok('点卡片进入全屏编辑', await page.eval(
    `document.querySelector('#fe-body').value.length > 100`));
  await page.click('#fe-cancel');
  await new Promise((r) => setTimeout(r, 200));

  // --- 空状态（C-06 的娱乐侧）---
  await page.click('.sheet .row .btn[data-i="0"]'); // 关闭详情面板
  await new Promise((r) => setTimeout(r, 300));
  await page.eval(`(async () => {
    const st = await import('/js/store.js');
    for (const g of [...st.state.games]) await st.removeRecord('games', g.id);
  })()`);
  await goto(page, '#/home');
  await goto(page, '#/fun');
  await new Promise((r) => setTimeout(r, 350));
  ok('清空后显示空状态', await page.eval(`document.querySelector('.empty') !== null`));

  await page.close();
  exitCode = report('M4');
} catch (err) {
  console.error('M4 测试异常：', err);
  exitCode = 1;
} finally {
  await shutdownApp();
}
process.exit(exitCode);
