// 用真实应用截图（灌入一组像样的样例数据），用于视觉验收
import fs from 'node:fs';
import path from 'node:path';
import { startServer } from './server.mjs';
import { launchBrowser } from './cdp.mjs';

const OUT = path.resolve('截图-v1');
fs.mkdirSync(OUT, { recursive: true });

const server = await startServer('app', 0);
const browser = await launchBrowser();

const SEED = `(async () => {
  const st = await import('/js/store.js');
  const d = await import('/js/core/dates.js');
  const today = d.todayStr();
  const now = Date.now();

  await st.saveRecord('settings', null).catch(() => {});
  await st.saveSettings({ theme: 'light', weekStart: 1 });

  // 便签
  const notes = [
    ['买电池（遥控器那种 5 号）', 'y', true],
    ['问一下周四小班调课，韩梅梅家长说那天有事', 'b', false],
    ['备用钥匙在门口抽屉第二层', 'g', false],
    ['学生说想学导数，下学期可以提前备一下', 'p', false],
    ['换季了，把厚被子拿出来晒', 'y', false],
  ];
  for (const [content, color, pinned] of notes) {
    await st.saveRecord('notes', { id: 'n' + Math.random().toString(36).slice(2, 8),
      content, color, pinned, createdAt: now - Math.random() * 8640000 });
  }

  // 计划
  const tasks = [
    ['备下午的课', '09:00', false], ['联系家长', '14:00', false],
    ['去超市买电池', '20:00', true], ['交季度总结', null, false],
    ['读完《给教师的建议》20 页', null, false],
  ];
  let i = 0;
  for (const [title, time, done] of tasks) {
    await st.saveRecord('tasks', { id: 't' + (i++), date: today, title, time, note: '',
      done, doneAt: done ? now : null, sort: i * 10, createdAt: now,
      repeat: { type: 'none', weekdays: [], sourceId: null } });
  }
  await st.saveRecord('tasks', { id: 't9', date: today, title: '改昨天学生的作业', time: null,
    note: '', done: true, doneAt: now, sort: 90, createdAt: now,
    repeat: { type: 'none', weekdays: [], sourceId: null } });

  // 学生 + 课次
  const students = [['s1', '王小明'], ['s2', '李雷'], ['s3', '韩梅梅'], ['s4', '张三']];
  for (const [id, name] of students) await st.saveRecord('students', { id, name, createdAt: now });

  const week = d.weekDates(today, 1);
  const mk = (id, date, start, type, members, status, content, homework) => ({
    id, date, start, duration: 90, type, place: '3 号教室', status, content, homework,
    repeat: { type: 'none', weekdays: [], sourceId: null },
    members: members.map(([sid, name]) => ({ studentId: sid, name, state: 'great', note: '', attendance: status === 'done' ? 'done' : 'todo' })),
    createdAt: now,
  });

  await st.saveRecord('lessons', mk('l1', week[0], '19:00', 'one',
    [['s1', '王小明']], 'done', '一次函数复习，图像平移，做了 6 道综合题。', '卷子第 2 页'));
  await st.saveRecord('lessons', mk('l2', week[2], '16:00', 'small',
    [['s2', '李雷'], ['s3', '韩梅梅']], 'done', '二次函数顶点式，配方法 8 道。', '练习册 P32–34'));
  await st.saveRecord('lessons', mk('l3', week[5], '09:00', 'one',
    [['s1', '王小明']], 'todo', '', ''));
  await st.saveRecord('lessons', mk('l4', week[5], '14:00', 'small',
    [['s2', '李雷'], ['s3', '韩梅梅'], ['s4', '张三']], 'todo', '', ''));
  // 给 l3 预填一点内容，截图更好看
  const l3 = (await import('/js/store.js')).state.lessons.find(l => l.id === 'l3');
  await st.saveRecord('lessons', { ...l3, content: '二次函数顶点式推导，对称轴判断。',
    homework: '练习册 P32–34，错的 3 道重做。' });

  // 游戏
  const games = [
    ['明日方舟', '手机', 'playing', 5, '主线 14 章，最近在练棘刺'],
    ['星露谷物语', 'PC', 'playing', 5, '第三年冬，刚修好温室'],
    ['空洞骑士：丝之歌', 'PC', 'wish', 0, '等打折，先记着'],
    ['塞尔达传说：王国之泪', 'Switch', 'cleared', 4, '主线 + 空岛全清，约 90 小时'],
  ];
  let gi = 0;
  for (const [name, platform, status, rating, note] of games) {
    await st.saveRecord('games', { id: 'g' + (gi++), name, platform, status, rating, note, updatedAt: now });
  }

  // 活动
  await st.saveRecord('activities', { id: 'a1', game: '明日方舟', title: '危机合约 · 第 12 赛季',
    due: d.addDays(today, 1), note: '', done: false, createdAt: now });
  await st.saveRecord('activities', { id: 'a2', game: '暖雪', title: '万圣节限时副本',
    due: d.addDays(today, 6), note: '每天可打 3 次', done: false, createdAt: now });

  // 追更
  await st.saveRecord('shows', { id: 'sh1', name: '葬送的芙莉莲', weekday: d.weekdayIndex1(today),
    current: 8, total: 28, kind: 'anime' });
  await st.saveRecord('shows', { id: 'sh2', name: '迷宫饭', weekday: 4, current: 19, total: 24, kind: 'anime' });

  // 体验
  await st.saveRecord('experiences', { id: 'e1', title: '星露谷物语', type: 'game', rating: 5,
    body: '一百二十小时之后终于把温室修起来了。最好玩的不是赚钱，是每天早上去看一遍作物长没长。',
    progress: '已通关', date: today, createdAt: now });
  await st.saveRecord('experiences', { id: 'e2', title: '沙丘 2', type: 'movie', rating: 4,
    body: 'IMAX 看的，声音大得椅子在震。剧情其实很直，但那种压迫感值回票价。',
    progress: '', date: today, createdAt: now - 1000 });

  return { lessons: ['l1', 'l3'] };
})()`;

const shots = [
  ['home', '#/home'],
  ['plan', '#/plan'],
  ['schedule', '#/schedule'],
  ['lesson', '#/lesson?id=l3'],
  ['students', '#/students'],
  ['student', '#/student?id=s1'],
  ['fun-lib', '#/fun'],
  ['fun-act', '#/fun|act'],
  ['fun-watch', '#/fun|watch'],
  ['fun-exp', '#/fun|exp'],
  ['memo', '#/memo'],
  ['settings', '#/settings'],
];

try {
  const page = await browser.newPage('about:blank');
  await page.send('Emulation.setDeviceMetricsOverride', {
    width: 430, height: 932, deviceScaleFactor: 2, mobile: true,
  });
  await page.goto(`${server.url}/index.html#/home`);
  await page.waitFor(`document.querySelector('.home-body') !== null`, { message: '首页' });
  await page.eval(SEED);
  await page.reload();
  await page.waitFor(`document.querySelector('.home-body') !== null`);
  await new Promise((r) => setTimeout(r, 400));

  for (const [name, target] of shots) {
    const [hash, tab] = target.split('|');
    await page.eval(`location.hash = ${JSON.stringify(hash)}`);
    await new Promise((r) => setTimeout(r, 500));
    if (tab) {
      await page.eval(`document.querySelector('#funSeg [data-tab="${tab}"]')?.click()`);
      await new Promise((r) => setTimeout(r, 400));
    }
    await page.screenshot(path.join(OUT, `${name}.png`));
    console.log('shot', name);
  }

  // 深色版
  await page.eval(`(async () => { await (await import('/js/store.js')).saveSettings({ theme: 'dark' }); })()`);
  for (const [name, hash] of [['home-dark', '#/home'], ['schedule-dark', '#/schedule'], ['fun-dark', '#/fun']]) {
    await page.eval(`location.hash = ${JSON.stringify(hash)}`);
    await new Promise((r) => setTimeout(r, 500));
    await page.screenshot(path.join(OUT, `${name}.png`));
    console.log('shot', name);
  }

  await page.close();
} finally {
  await browser.close();
  await server.close();
}
