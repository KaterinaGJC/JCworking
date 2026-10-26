// 四屏（课表/娱乐/备忘/设置）+ 首页心情历史的截图
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

  // 用内置测试数据生成器把各模块填满（只在临时浏览器里，不碰真实数据）
  await page.eval(`window.__jc.seed().then(() => true)`);
  await sleep(600);
  await page.eval(`(async () => {
    const mood = await import('/js/core/mood.js');
    const d = await import('/js/core/dates.js');
    const t = d.todayStr();
    // 造出"最近几天都有心情"的痕迹，方便看历史条
    const back = (n) => { const x = new Date(); x.setDate(x.getDate() - n);
      return x.getFullYear() + '-' + String(x.getMonth()+1).padStart(2,'0') + '-' + String(x.getDate()).padStart(2,'0'); };
    await mood.setMood(t, 'calm');
    await mood.setMood(back(1), 'happy');
    await mood.setMood(back(2), 'tired');
    await mood.setMood(back(3), 'sad');
    await mood.setMood(back(5), 'happy');
  })()`);

  const shots = [
    ['首页', '#/home', '.home-body'],
    ['课表', '#/schedule', '.timetable'],
    ['娱乐', '#/fun', '.fun-body'],
    ['备忘', '#/memo', '.memo-body'],
    ['设置', '#/settings', '.srow'],
  ];

  for (const [name, hash, sel] of shots) {
    await page.eval(`location.hash = '${hash}'`);
    await page.reload();
    await page.waitFor(`document.querySelector('${sel}') !== null`, { message: name, timeout: 20000 });
    await sleep(1100);
    await page.screenshot(path.join(OUT, `${name}.png`));
    console.log('shot', name);
  }

  // 记录页（多图 2×2 拼贴）：先造一条带 4 张图的记录
  await page.eval(`(async () => {
    const st = await import('/js/store.js');
    const mk = (id, hue) => {
      const cv = document.createElement('canvas');
      cv.width = 420; cv.height = 300;
      const c = cv.getContext('2d');
      const g = c.createLinearGradient(0, 0, 420, 300);
      g.addColorStop(0, 'hsl(' + hue + ' 45% 92%)');
      g.addColorStop(1, 'hsl(' + (hue + 30) + ' 40% 80%)');
      c.fillStyle = g; c.fillRect(0, 0, 420, 300);
      c.fillStyle = 'rgba(95,134,168,.30)';
      c.beginPath(); c.arc(120, 110, 40, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(140,170,200,.25)';
      c.beginPath(); c.moveTo(0, 300); c.lineTo(130, 170); c.lineTo(260, 250); c.lineTo(420, 300); c.closePath(); c.fill();
      return { id, dataUrl: cv.toDataURL('image/jpeg', 0.8), w: 420, h: 300 };
    };
    const blobs = [mk('m1', 205), mk('m2', 230), mk('m3', 150), mk('m4', 265)];
    await st.saveMany('blobs', blobs);
    await st.saveRecord('posts', {
      id: 'p-multi',
      text: '周末整理了几张照片，配图试试 2×2 拼贴。',
      images: blobs.map(b => b.id),
      liked: false, comments: [], createdAt: Date.now(),
    });
  })()`);
  await page.eval(`location.hash = '#/post'`);
  await page.reload();
  await page.waitFor(`document.querySelector('.post-body') !== null`, { message: '记录页' });
  await sleep(1100);
  await page.eval(`document.querySelector('.post-body').parentElement.scrollTop = 300`);
  await sleep(400);
  await page.screenshot(path.join(OUT, '记录-多图.png'));
  console.log('shot 记录-多图');
} finally {
  await browser.close();
  await server.close();
}
