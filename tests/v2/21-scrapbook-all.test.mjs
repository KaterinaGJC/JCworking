// 验证项 21：手账风铺满全站 + 心情历史 + 多图拼贴 + 视图过渡切换
import { bootApp, shutdownApp, freshPage, goto, ok, eq, report } from '../lib.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let exitCode = 1;

try {
  await bootApp();
  const page = await freshPage();

  // 造一批数据，让四屏都有内容
  await page.eval(`(async () => {
    const st = await import('/js/store.js');
    const d = await import('/js/core/dates.js');
    const t = d.todayStr();
    await st.saveMany('tasks', [{ id: 'q1', date: t, title: '备课', time: '09:00', sort: 1,
      done: false, doneAt: null, note: '', repeat: { type: 'none', weekdays: [], sourceId: null },
      createdAt: Date.now() }]);
    await st.saveRecord('notes', { id: 'nn1', content: '买电池', color: 'y', pinned: false, images: [], createdAt: Date.now() });
    await st.saveRecord('games', { id: 'g1', name: '塞尔达', platform: '手机', status: 'playing', rating: 4, note: '' });
    await st.saveRecord('lessons', { id: 'l1', date: t, start: '09:00', duration: 45, slotId: 'slot-1',
      type: 'one', place: '', status: 'todo', content: '', homework: '', images: [],
      repeat: { type: 'none', weekdays: [], sourceId: null },
      members: [{ studentId: 's1', name: '王小明', state: 'great', note: '', attendance: 'none' }],
      createdAt: Date.now() });
  })()`);

  // ---------- 1. 四屏都换上了纸感（撕边或纸色） ----------
  const skins = [
    ['#/schedule', '.timetable-wrap', '课表'],
    ['#/fun', '.fun-body', '娱乐'],
    ['#/memo', '.memo-body', '备忘'],
    ['#/settings', '.statrow', '设置'],
  ];
  for (const [hash, sel, name] of skins) {
    await goto(page, hash);
    await page.waitFor(`document.querySelector('${sel}') !== null`, { message: name, timeout: 20000 });
    await sleep(250);
    const s = await page.eval(`(() => {
      const el = document.querySelector('${sel}');
      const cs = getComputedStyle(el);
      return { clip: cs.clipPath, bg: cs.backgroundColor, radius: cs.borderRadius };
    })()`);
    const isPaper = s.bg === 'rgb(253, 250, 245)' || s.bg === 'rgb(241, 247, 253)'
      || s.bg === 'rgba(0, 0, 0, 0)' || s.bg === 'rgb(255, 253, 248)';
    ok(`${name}页有纸感（纸色或撕边）`, isPaper || s.clip !== 'none', JSON.stringify(s));
  }

  // 课表要能正常点（撕边不影响交互）
  await goto(page, '#/schedule');
  await page.waitFor(`document.querySelector('.tt-cell') !== null`);
  await sleep(600);   // 等视图过渡（420ms）结束再测命中，否则测到的是过渡快照
  const cellClickable = await page.eval(`(() => {
    const c = document.querySelector('.tt-add');
    const r = c.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && (hit === c || c.contains(hit));
  })()`);
  ok('课表格子里的 ＋ 仍然可点（撕边没挡住）', cellClickable === true);

  // ---------- 2. 心情历史条 ----------
  await goto(page, '#/home');
  await page.waitFor(`document.querySelector('.mood-week') !== null`, { message: '心情历史' });
  const dots = await page.eval(`document.querySelectorAll('.mood-week .wd').length`);
  eq('心情历史条有 7 天', dots, 7);
  const todayDot = await page.eval(`document.querySelectorAll('.mood-week .wd.today').length`);
  eq('最后一天是"今天"', todayDot, 1);
  await page.click('.mood-card [data-mood="happy"]');
  await sleep(500);
  const filled = await page.eval(`document.querySelectorAll('.mood-week .dot.has').length`);
  ok('记录了心情后，历史条上出现实心圆点', filled >= 1, String(filled));

  // ---------- 3. 记录页多图 2×2 ----------
  await goto(page, '#/post');
  await page.waitFor(`document.querySelector('.post-body') !== null`);
  const grid = await page.eval(`(() => {
    const wrap = document.createElement('div');
    wrap.className = 'post-imgs';
    for (let i = 0; i < 4; i += 1) {
      const w = document.createElement('div'); w.className = 'img-thumb-wrap';
      const img = document.createElement('img'); img.className = 'img-thumb';
      w.appendChild(img); wrap.appendChild(w);
    }
    const card = document.createElement('article');
    card.className = 'post-card';
    card.appendChild(wrap);
    document.querySelector('.post-body').appendChild(card);
    const cs = getComputedStyle(wrap);
    const out = { display: cs.display, cols: cs.gridTemplateColumns, thumbBorder: getComputedStyle(wrap.firstChild.firstChild).borderTopWidth };
    card.remove();
    return out;
  })()`);
  ok('多图用网格拼贴', grid.display === 'grid', JSON.stringify(grid));
  ok('两列（2×2）', grid.cols.split(' ').length === 2, grid.cols);
  ok('拼贴里的图仍带拍立得白边', parseFloat(grid.thumbBorder) > 0, grid.thumbBorder);

  // ---------- 4. 页面切换：新便签贴上（CSS slap），且动画期间不吞点击 ----------
  const anim = await page.eval(`(async () => {
    const cssText = await (await fetch('/css/scrapbook.css')).text();
    const cs = getComputedStyle(document.querySelector('.page'));
    return {
      name: cs.animationName,
      dur: cs.animationDuration,
      hasSlap: cssText.includes('@keyframes slap'),
      hasVT: cssText.includes('view-transition-name'),
    };
  })()`);
  ok('页面切换用 slap 动画（新便签贴上来）', anim.name === 'slap', JSON.stringify(anim));
  ok('切换动画 < 500ms', parseFloat(anim.dur) < 0.5, anim.dur);
  ok('没有启用会吞点击的 View Transitions', anim.hasVT === false, String(anim.hasVT));

  // 切页后立刻点输入框，必须能聚焦（防"动画期间点不动"回归）
  await goto(page, '#/memo');
  await page.waitFor(`document.querySelector('#memoInput') !== null`, { message: '备忘页' });
  await page.realClick('#memoInput');
  await sleep(200);
  const focused = await page.eval(`document.activeElement?.id || ''`);
  eq('切页动画期间点击也不丢失（输入框能聚焦）', focused, 'memoInput');

  await page.close();
  exitCode = report('验证项 21 · 全站手账风');
} catch (err) {
  console.error('测试异常：', err);
  exitCode = 1;
} finally {
  await shutdownApp();
}
process.exit(exitCode);
