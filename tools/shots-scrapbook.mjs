// 拍手账风的实机截图：430×932（iPhone 15 尺寸），含若干真实数据
import fs from 'node:fs';
import path from 'node:path';
import { startServer } from '../tools/server.mjs';
import { launchBrowser } from '../tools/cdp.mjs';

const OUT = path.resolve('设计/手账风/截图');
fs.mkdirSync(OUT, { recursive: true });

const server = await startServer('app', 0);
const browser = await launchBrowser();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  const page = await browser.newPage('about:blank');
  await page.send('Emulation.setDeviceMetricsOverride', {
    width: 430, height: 932, deviceScaleFactor: 2, mobile: true,
  });

  await page.goto(`${server.url}/index.html#/home`);
  await page.waitFor(`document.querySelector('.home-body') !== null`, { message: '首页' });

  // ---- 开屏：清掉"已看过"标记，用 Page.reload（不等 load）卡在动画中途 ----
  await page.eval(`sessionStorage.removeItem('jc-splash')`);
  await page.send('Page.reload', {});
  await sleep(560);
  await page.screenshot(path.join(OUT, '开屏-翻开中.png'));

  await sleep(1800);   // 等开屏结束

  // ---- 灌一批看着像真的数据 ----
  await page.eval(`(async () => {
    const st = await import('/js/store.js');
    const d = await import('/js/core/dates.js');
    const today = d.todayStr();
    const mk = (o) => ({ done: false, doneAt: null, sort: 0, note: '',
      repeat: { type: 'none', weekdays: [], sourceId: null }, createdAt: Date.now(), ...o });
    await st.saveMany('tasks', [
      mk({ id: 'a1', date: today, title: '备下午的课', time: '09:00', sort: 1 }),
      mk({ id: 'a2', date: today, title: '联系家长（韩梅梅请假）', time: '14:00', sort: 2 }),
      mk({ id: 'a3', date: today, title: '去超市买电池', time: null, sort: 3 }),
      mk({ id: 'a4', date: today, title: '回学生微信', time: '08:20', sort: 4,
           done: true, doneAt: Date.now() }),
      mk({ id: 'a5', date: today, title: '改昨天学生的作业', time: '20:30', sort: 5,
           done: true, doneAt: Date.now() }),
    ]);
    await st.saveMany('notes', [
      { id: 'n1', content: '买电池（遥控器 5 号）', color: 'y', pinned: true,
        images: [], createdAt: Date.now() - 600000 },
      { id: 'n2', content: '问一下周四小班调课', color: 'b', pinned: false,
        images: [], createdAt: Date.now() - 3600000 },
    ]);
    await st.saveMany('posts', [
      { id: 'p1', text: '今天小班讲二次函数，韩梅梅请假的作业得单独补一份。\\n顺手把家长的话记下来，省得忘。',
        images: [], liked: true, comments: [{ id: 'c1', text: '好的老师', createdAt: Date.now() - 4000 }],
        createdAt: Date.now() - 240000 },
      { id: 'p2', text: '这节课的顶点式总算推明白了，速度还是慢一点。',
        images: [], liked: false, comments: [], createdAt: Date.now() - 90000000 },
    ]);
  })()`);

  await page.eval(`location.hash = '#/home'`);
  await page.reload();                                    // 重新加载，让种子数据进页面
  await page.waitFor(`document.querySelector('.home-body') !== null`, { message: '首页重载' });
  await sleep(900);
  await page.screenshot(path.join(OUT, '首页.png'));

  // 滚到下面再拍一张（看便签墙层叠感）
  await page.eval(`document.querySelector('.home-body').parentElement.scrollTop = 380`);
  await sleep(450);
  await page.screenshot(path.join(OUT, '首页-下半屏.png'));
  await page.eval(`document.querySelector('.home-body').parentElement.scrollTop = 0`);

  await page.eval(`location.hash = '#/post'`);
  await sleep(700);
  await page.screenshot(path.join(OUT, '记录.png'));

  // 弹层也看一眼（贴纸式的纸）
  await page.eval(`location.hash = '#/home'`);
  await sleep(500);
  await page.eval(`document.querySelector('[data-plan-add]')?.click()`);
  await sleep(600);
  await page.screenshot(path.join(OUT, '新增面板.png'));

  console.log('截图完成');
} finally {
  await browser.close();
  await server.close();
}
