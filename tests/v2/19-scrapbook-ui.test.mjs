// 验证项 19：手账拼贴风的「五套」——心情记录 / 页码贴纸 / 贴纸切页 /
//             拍立得相框 / 夜间纸（深色）
import { bootApp, shutdownApp, freshPage, goto, ok, eq, report } from '../lib.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let exitCode = 1;

try {
  await bootApp();
  const page = await freshPage();

  // ---------- 1. 心情记录：五个圈 + 点击落库 ----------
  await goto(page, '#/home');
  await page.waitFor(`document.querySelector('.mood-card') !== null`, { message: '心情卡' });

  const moods = await page.eval(`document.querySelectorAll('.mood-card [data-mood]').length`);
  eq('心情卡有 5 个心情圈', moods, 5);

  const caps = await page.eval(
    `[...document.querySelectorAll('.mood-card .mood-cap')].map(e => e.textContent).join('/')`);
  ok('五个心情都有中文标签', caps.includes('开心') && caps.includes('平静'), caps);

  await page.click('.mood-card [data-mood="happy"]');
  await sleep(500);

  const stored = await page.eval(`(async () => {
    const st = await import('/js/store.js');
    const d = await import('/js/core/dates.js');
    const m = st.getMeta('mood:' + d.todayStr(), null);
    return m ? m.id : null;
  })()`);
  eq('点心情后写进了 meta（不新增数据表）', stored, 'happy');

  const onCls = await page.eval(
    `document.querySelector('.mood-card [data-mood="happy"]').classList.contains('on')`);
  ok('选中态落在被点的那个圈上', onCls === true);

  const line = await page.eval(`document.querySelector('[data-mood-line]').textContent.trim()`);
  ok('心情下面有一句手写话', line.length > 0, line);

  // 刷新后还在（持久化）
  await page.reload();
  await page.waitFor(`document.querySelector('.mood-card') !== null`);
  await sleep(400);
  const afterReload = await page.eval(
    `document.querySelector('.mood-card [data-mood].on')?.dataset.mood || null`);
  eq('刷新后心情仍然选中', afterReload, 'happy');

  // ---------- 2. 页码贴纸：底部标签带 01–05 ----------
  const nums = await page.eval(`(() => {
    const tabs = [...document.querySelectorAll('#tabbar .tab')];
    return tabs.map(t => getComputedStyle(t, '::before').content.replace(/"/g, ''));
  })()`);
  eq('底部 5 个标签都有页码贴纸', nums.length, 5);
  ok('页码是 01–05', nums.join(',') === '01,02,03,04,05', nums.join(','));

  // ---------- 3. 贴纸切页：新页面"贴上来" ----------
  const anim = await page.eval(
    `getComputedStyle(document.querySelector('.page')).animationName`);
  eq('页面切换用 slap 动画（新便签贴上来）', anim, 'slap');

  const slapDur = await page.eval(
    `getComputedStyle(document.querySelector('.page')).animationDuration`);
  ok('切页动画时长 < 500ms（不拖沓）', parseFloat(slapDur) < 0.5, slapDur);

  // ---------- 4. 拍立得相框（记录页配图） ----------
  await goto(page, '#/post');
  await page.waitFor(`document.querySelector('.post-body') !== null`, { message: '记录页' });
  const polaroid = await page.eval(`(() => {
    const card = document.createElement('article');
    card.className = 'post-card';
    const wrap = document.createElement('div');
    wrap.className = 'img-thumb-wrap';
    const img = document.createElement('img');
    img.className = 'img-thumb';
    wrap.appendChild(img); card.appendChild(wrap);
    document.querySelector('.post-body').appendChild(card);
    const cs = getComputedStyle(img);
    const out = {
      bottom: parseFloat(cs.borderBottomWidth),
      top: parseFloat(cs.borderTopWidth),
      color: cs.borderTopColor,
      rotate: getComputedStyle(wrap).transform,
    };
    card.remove();
    return out;
  })()`);
  ok('配图有拍立得式的底部留白（下边框 > 上边框）',
    polaroid.bottom > polaroid.top + 8, JSON.stringify(polaroid));
  ok('拍立得白边是暖白（不是纯白）', polaroid.color !== 'rgb(255, 255, 255)', polaroid.color);
  ok('拍立得相纸带轻微倾斜', polaroid.rotate !== 'none', polaroid.rotate);

  // ---------- 5. 夜间纸（深色模式） ----------
  await goto(page, '#/home');
  await page.waitFor(`document.querySelector('.home-body > .card') !== null`, { message: '回到首页' });
  const dark = await page.eval(`(() => {
    const rgb = (s) => s.match(/\\d+/g).slice(0, 3).map(Number);
    const lum = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    const before = {
      bg: getComputedStyle(document.body).backgroundColor,
      card: getComputedStyle(document.querySelector('.home-body > .card')).backgroundColor,
      text: getComputedStyle(document.body).color,
    };
    document.documentElement.setAttribute('data-theme', 'dark');
    const after = {
      bg: getComputedStyle(document.body).backgroundColor,
      card: getComputedStyle(document.querySelector('.home-body > .card')).backgroundColor,
      text: getComputedStyle(document.body).color,
    };
    document.documentElement.removeAttribute('data-theme');
    return { before, after,
      lumBefore: lum(rgb(before.bg)), lumAfter: lum(rgb(after.bg)),
      cardLumBefore: lum(rgb(before.card)), cardLumAfter: lum(rgb(after.card)),
      textLumBefore: lum(rgb(before.text)), textLumAfter: lum(rgb(after.text)) };
  })()`);
  ok('深色下页面底色变暗', dark.lumAfter < dark.lumBefore - 0.3,
    `${dark.lumBefore.toFixed(2)} → ${dark.lumAfter.toFixed(2)}`);
  ok('深色下纸张变暗（夜间纸，不是纯黑）',
    dark.cardLumAfter < dark.cardLumBefore - 0.3 && dark.cardLumAfter > 0.05,
    `${dark.cardLumBefore.toFixed(2)} → ${dark.cardLumAfter.toFixed(2)}`);
  ok('深色下文字变浅', dark.textLumAfter > dark.textLumBefore + 0.3,
    `${dark.textLumBefore.toFixed(2)} → ${dark.textLumAfter.toFixed(2)}`);

  // ---------- 6. 首页仍然不含课表内容（C-01 不能被破坏） ----------
  const homeText = await page.eval(`document.querySelector('.home-body').textContent`);
  ok('首页仍不出现课表内容（C-01）',
    !homeText.includes('教培') && !homeText.includes('一对一') && !homeText.includes('小班'));

  await page.close();
  exitCode = report('验证项 19 · 手账风五套');
} catch (err) {
  console.error('测试异常：', err);
  exitCode = 1;
} finally {
  await shutdownApp();
}
process.exit(exitCode);
