// 拍手账风的实机截图：430×932，含心情、拍立得、夜间纸
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

  // ---- 灌数据：计划 / 便签 / 记录（带一张"照片"）/ 心情 ----
  await page.eval(`(async () => {
    const st = await import('/js/store.js');
    const d = await import('/js/core/dates.js');
    const mood = await import('/js/core/mood.js');
    const today = d.todayStr();
    const mk = (o) => ({ done: false, doneAt: null, sort: 0, note: '',
      repeat: { type: 'none', weekdays: [], sourceId: null }, createdAt: Date.now(), ...o });

    await st.saveMany('tasks', [
      mk({ id: 'a1', date: today, title: '备下午的课', time: '09:00', sort: 1 }),
      mk({ id: 'a2', date: today, title: '联系家长（韩梅梅请假）', time: '14:00', sort: 2 }),
      mk({ id: 'a3', date: today, title: '去超市买电池', time: null, sort: 3 }),
      mk({ id: 'a4', date: today, title: '回学生微信', time: '08:20', sort: 4, done: true, doneAt: Date.now() }),
      mk({ id: 'a5', date: today, title: '改昨天学生的作业', time: '20:30', sort: 5, done: true, doneAt: Date.now() }),
    ]);

    await st.saveMany('notes', [
      { id: 'n1', content: '买电池（遥控器 5 号）', color: 'y', pinned: true, images: [], createdAt: Date.now() - 600000 },
      { id: 'n2', content: '问一下周四小班调课', color: 'b', pinned: false, images: [], createdAt: Date.now() - 3600000 },
    ]);

    // 造一张 480×360 的"照片"，存进 blobs（模拟用户拍/选的图）
    const cv = document.createElement('canvas');
    cv.width = 480; cv.height = 360;
    const c = cv.getContext('2d');
    const g = c.createLinearGradient(0, 0, 480, 360);
    g.addColorStop(0, '#DCEBFB'); g.addColorStop(.55, '#F3F8FF'); g.addColorStop(1, '#CBD9EA');
    c.fillStyle = g; c.fillRect(0, 0, 480, 360);
    c.fillStyle = 'rgba(95,134,168,.35)';
    c.beginPath(); c.arc(150, 130, 46, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(140,170,200,.28)';
    c.beginPath(); c.moveTo(0, 360); c.lineTo(150, 210); c.lineTo(280, 300); c.lineTo(400, 230); c.lineTo(480, 360); c.closePath(); c.fill();
    c.fillStyle = 'rgba(74,69,67,.55)';
    c.font = '600 22px "Microsoft YaHei"';
    c.fillText('作业照片', 24, 332);
    const dataUrl = cv.toDataURL('image/jpeg', 0.8);
    await st.saveRecord('blobs', { id: 'img1', dataUrl, w: 480, h: 360 });

    await st.saveMany('posts', [
      { id: 'p1',
        text: '今天小班讲二次函数，韩梅梅请假的作业得单独补一份。顺手把家长的话记下来，省得忘。',
        images: ['img1'], liked: true, comments: [{ id: 'c1', text: '好的老师', createdAt: Date.now() - 4000 }],
        createdAt: Date.now() - 240000 },
      { id: 'p2', text: '这节课的顶点式总算推明白了，速度还是慢一点。',
        images: [], liked: false, comments: [], createdAt: Date.now() - 90000000 },
    ]);

    await mood.setMood(today, 'calm');
  })()`);

  await page.eval(`location.hash = '#/home'`);
  await page.reload();
  await page.waitFor(`document.querySelector('.home-body') !== null`, { message: '首页重载' });
  await sleep(1200);
  await page.screenshot(path.join(OUT, '首页.png'));

  await page.eval(`document.querySelector('.home-body').parentElement.scrollTop = 240`);
  await sleep(400);
  await page.screenshot(path.join(OUT, '首页-心情卡.png'));
  await page.eval(`document.querySelector('.home-body').parentElement.scrollTop = 0`);

  await page.eval(`location.hash = '#/post'`);
  await sleep(900);
  await page.screenshot(path.join(OUT, '记录.png'));

  // 记录页往下滚，拍立得相框那张
  await page.eval(`document.querySelector('.post-body').parentElement.scrollTop = 260`);
  await sleep(400);
  await page.screenshot(path.join(OUT, '记录-拍立得.png'));
  await page.eval(`document.querySelector('.post-body').parentElement.scrollTop = 0`);

  // ---- 夜间纸 ----
  await page.eval(`(async () => {
    const st = await import('/js/store.js');
    const th = await import('/js/theme.js');
    await st.saveSettings({ theme: 'dark' });
    th.applyTheme('dark');
  })()`);
  await page.eval(`location.hash = '#/home'`);
  await sleep(800);
  await page.screenshot(path.join(OUT, '夜间纸-首页.png'));

  await page.eval(`location.hash = '#/post'`);
  await sleep(800);
  await page.screenshot(path.join(OUT, '夜间纸-记录.png'));

  // 复位成浅色
  await page.eval(`(async () => {
    const st = await import('/js/store.js');
    const th = await import('/js/theme.js');
    await st.saveSettings({ theme: 'light' });
    th.applyTheme('light');
  })()`);

  console.log('截图完成');
} finally {
  await browser.close();
  await server.close();
}
