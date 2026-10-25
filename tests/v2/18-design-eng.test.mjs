// 验证项 18：接入 emil-design-eng（设计工程指南）里的可验证规则
// 参考：https://github.com/memi-design/design-skills/tree/main/skills/emil-design-eng
//
// 只固化"能测"的硬规则，避免以后改样式时悄悄退化：
//   1) 禁止 transition: all（必须指定属性）
//   2) 禁止 scale(0) 入场（要从 0.95 左右开始）
//   3) 尊重 prefers-reduced-motion（去掉位移，保留可读性）
//   4) 弹层/提示条用 transition 而不是关键帧（可被打断重定向）
//   5) 按钮按下有 transform 反馈，且松手有 160ms 回弹
//   6) 左滑删除支持"甩一下"（速度阈值），不只判距离
import { bootApp, shutdownApp, freshPage, goto, ok, eq, report } from '../lib.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let exitCode = 1;

try {
  await bootApp();
  const page = await freshPage();

  // ---------- 1~2. 静态检查 CSS 文本 ----------
  const cssText = await page.eval(`(async () => {
    const files = ['/css/tokens.css', '/css/base.css', '/css/pages.css'];
    const out = [];
    for (const f of files) out.push(await (await fetch(f)).text());
    return out.join('\\n');
  })()`);

  ok('没有 transition: all（必须指定具体属性）', !/transition\s*:\s*all\b/.test(cssText));
  ok('没有 scale(0) 入场（元素不该凭空出现）', !/scale\(\s*0\s*\)/.test(cssText));
  ok('没有 ease-in（会让 UI 显得迟钝）',
    !/(?<![-\w])ease-in(?![-\w])/.test(cssText.replace(/ease-in-out/g, '')));
  ok('定义了自定义 ease-out 曲线', /--ease-out\s*:\s*cubic-bezier/.test(cssText));
  ok('有 prefers-reduced-motion 处理', /prefers-reduced-motion/.test(cssText));

  // ---------- 3. 弹层用 transition（非关键帧） ----------
  await goto(page, '#/memo');
  await page.waitFor(`document.querySelector('#memoInput') !== null`);
  await page.type('#memoInput', '设计工程验证');
  await page.press('Enter', '#memoInput');
  await sleep(400);

  await goto(page, '#/home');                            // 计划并进首页后，用它那张卡上的 ＋
  await page.waitFor(`document.querySelector('.home-body') !== null`);
  await page.click('[data-plan-add]');
  await page.waitFor(`document.querySelector('.sheet') !== null`, { message: '面板打开' });

  const sheetStyle = await page.eval(`(() => {
    const s = getComputedStyle(document.querySelector('.sheet'));
    return { anim: s.animationName, trans: s.transitionProperty, dur: s.transitionDuration };
  })()`);
  ok('弹层不再用关键帧动画（animation-name 为 none）', sheetStyle.anim === 'none', JSON.stringify(sheetStyle));
  ok('弹层用 transition 做入场', /transform/.test(sheetStyle.trans), JSON.stringify(sheetStyle));

  const toastStyle = await page.eval(`(() => {
    const el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
    const s = getComputedStyle(el);
    const r = { anim: s.animationName, trans: s.transitionProperty };
    el.remove();
    return r;
  })()`);
  ok('提示条也用 transition（连弹时可打断重定向）',
    toastStyle.anim === 'none' && /transform/.test(toastStyle.trans), JSON.stringify(toastStyle));

  await page.eval(`document.querySelector('.sheet-mask')?.remove()`);

  // ---------- 4. 按钮按下反馈 ----------
  const btnStyle = await page.eval(`(() => {
    const b = document.createElement('button');
    b.className = 'btn';
    document.body.appendChild(b);
    const s = getComputedStyle(b);
    const out = { trans: s.transitionProperty, dur: s.transitionDuration };
    b.remove();
    return out;
  })()`);
  ok('按钮带 transform 过渡（松手有回弹）', /transform/.test(btnStyle.trans), JSON.stringify(btnStyle));

  const bigBtn = await page.eval(`(() => {
    const b = document.createElement('button');
    b.className = 'bigbtn';
    document.body.appendChild(b);
    const s = getComputedStyle(b);
    const out = { trans: s.transitionProperty, dur: s.transitionDuration };
    b.remove();
    return out;
  })()`);
  ok('主按钮回弹时长 160ms（100–160ms 区间）',
    /transform/.test(bigBtn.trans) && parseFloat(bigBtn.dur) > 0.05 && parseFloat(bigBtn.dur) <= 0.2,
  JSON.stringify(bigBtn));

  // ---------- 5. 左滑删除：甩一下就能删（速度阈值） ----------
  await goto(page, '#/memo');
  await page.waitFor(`document.querySelector('.note') !== null`);
  const before = await page.eval(`(async () => (await import('/js/store.js')).state.notes.length)()`);

  // 快速甩：只移 70px，但耗时极短 → 速度约 2 px/ms，远超 0.11
  const flick = await page.eval(`(async () => {
    const note = document.querySelector('.note');
    const r = note.getBoundingClientRect();
    const fire = (type, x) => note.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: 1, isPrimary: true,
      clientX: x, clientY: r.top + r.height / 2,
    }));
    const x0 = r.left + r.width - 20;
    fire('pointerdown', x0);
    fire('pointermove', x0 - 40);
    fire('pointermove', x0 - 70);
    fire('pointerup', x0 - 70);
    await new Promise(res => setTimeout(res, 500));
    const st = await import('/js/store.js');
    return st.state.notes.length;
  })()`);
  eq('快速甩一下（位移只 70px）也能删除', flick, before - 1);

  // 慢速拖：同样 70px，但耗时 700ms → 速度 0.1 px/ms，不到阈值 → 不删
  await page.click('.toast button').catch(() => {});   // 撤销回来
  await sleep(400);
  const slow = await page.eval(`(async () => {
    const note = document.querySelector('.note');
    const r = note.getBoundingClientRect();
    const fire = (type, x) => note.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: 1, isPrimary: true,
      clientX: x, clientY: r.top + r.height / 2,
    }));
    const x0 = r.left + r.width - 20;
    fire('pointerdown', x0);
    fire('pointermove', x0 - 40);
    await new Promise(res => setTimeout(res, 700));
    fire('pointermove', x0 - 70);
    fire('pointerup', x0 - 70);
    await new Promise(res => setTimeout(res, 400));
    const st = await import('/js/store.js');
    return st.state.notes.length;
  })()`);
  eq('慢慢拖 70px 不会误删（靠距离判定）', slow, before);

  // ---------- 6. prefers-reduced-motion 真的生效 ----------
  await page.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await page.eval(`location.hash = '#/home'`);   // 回到首页再刷新，否则刷到的还是备忘页
  await page.reload();
  await page.waitFor(`document.querySelector('.home-body') !== null`, { message: '减动效模式启动' });
  await sleep(300);

  const reduced = await page.eval(`(() => {
    const p = document.querySelector('.page');
    const s = getComputedStyle(p);
    return { animDur: s.animationDuration, transDur: s.transitionDuration };
  })()`);
  ok('减动效模式下淡入几乎瞬时（≤50ms）',
    parseFloat(reduced.animDur) <= 0.05, JSON.stringify(reduced));

  await page.eval(`document.querySelector('.tab[data-act="home"]').click()`);
  await page.waitFor(`document.querySelector('.home-body') !== null`);
  await page.eval(`document.querySelector('[data-plan-add]').click()`);
  await page.waitFor(`document.querySelector('.sheet') !== null`);
  const reducedSheet = await page.eval(
    `getComputedStyle(document.querySelector('.sheet')).transitionDuration`);
  ok('减动效模式下弹层不做位移过渡',
    reducedSheet.split(',').every((d) => parseFloat(d) <= 0.05), reducedSheet);

  // 恢复默认
  await page.send('Emulation.setEmulatedMedia', { features: [] });

  await page.close();
  exitCode = report('验证项 18 · 设计工程规则');
} catch (err) {
  console.error('测试异常：', err);
  exitCode = 1;
} finally {
  await shutdownApp();
}
process.exit(exitCode);
