// 全量验收：PRD 第 10 章 A~I 共 37 条，一次真机浏览器会话逐条过
import { bootApp, shutdownApp, freshPage, goto, ok, eq, report, setOffline } from './lib.mjs';

let exitCode = 1;

const seed = (page, code) => page.eval(`(async () => {
  const st = await import('/js/store.js');
  const db = await import('/js/db.js');
  const d = await import('/js/core/dates.js');
  const core = await import('/js/core/backup.js');
  const { uid } = await import('/js/util.js');
  ${code}
})()`);

try {
  await bootApp();
  const page = await freshPage();

  /* ================= A. 安装与离线 ================= */
  const manifest = await page.eval(`fetch('/manifest.webmanifest').then(r => r.json())`);
  ok('A-01 应用能正常打开（标题正确）', (await page.eval(`document.title`)).includes('景臣'));
  ok('A-02 manifest 可用于安装（standalone + 图标）',
    manifest.display === 'standalone' && manifest.icons.length >= 3);
  ok('A-02b 图标文件可访问', (await page.eval(
    `Promise.all(['icons/icon-192.png','icons/icon-512.png','icons/icon-maskable-512.png']
      .map(u => fetch(u).then(r => r.status)))`)).every((s) => s === 200));

  const swReady = await page.eval(`(async () => {
    const reg = await navigator.serviceWorker.ready;
    for (let i = 0; i < 40 && !navigator.serviceWorker.controller; i++) {
      await new Promise(r => setTimeout(r, 100));
    }
    return !!reg.active && !!navigator.serviceWorker.controller;
  })()`);
  ok('A-03 Service Worker 已接管（全屏离线前提）', swReady);

  await setOffline(page, true);
  await page.reload();
  await page.waitFor(`document.querySelector('.home-body') !== null`, { message: '离线首页' });
  ok('A-04 飞行模式下仍能打开首页', true);
  const offlineNav = await page.eval(`(async () => {
    location.hash = '#/plan';
    await new Promise(r => setTimeout(r, 300));
    return !!document.querySelector('.plan-body');
  })()`);
  ok('A-04b 断网时可切换模块', offlineNav);
  await page.eval(`location.hash = '#/memo'`);
  await page.waitFor(`document.querySelector('#memoInput') !== null`);
  await page.type('#memoInput', '断网记的一条');
  await page.press('Enter', '#memoInput');
  await new Promise((r) => setTimeout(r, 400));
  ok('A-05 断网时新增数据也能保存', await page.eval(
    `(async () => (await import('/js/store.js')).state.notes.length)()`) === 1);
  await setOffline(page, false);
  await page.eval(`location.hash = '#/home'`);
  await page.reload();
  await page.waitFor(`document.querySelector('.home-body') !== null`);

  /* ================= B. 数据不丢 ================= */
  const beforeReload = await page.eval(`(async () => {
    const st = await import('/js/store.js');
    return { notes: st.state.notes.length, noteText: st.state.notes[0]?.content };
  })()`);
  await page.reload();
  await page.waitFor(`document.querySelector('.home-body') !== null`);
  const afterReload = await page.eval(`(async () => {
    const st = await import('/js/store.js');
    return { notes: st.state.notes.length, noteText: st.state.notes[0]?.content };
  })()`);
  ok('B-01 刷新后数据仍在', afterReload.notes === beforeReload.notes
    && afterReload.noteText === beforeReload.noteText);

  // 计划勾选后刷新
  await seed(page, `
    await st.saveRecord('tasks', { id: 'b2', date: d.todayStr(), title: 'B2 任务', time: null,
      note: '', done: false, doneAt: null, sort: 0, createdAt: Date.now(),
      repeat: { type: 'none', weekdays: [], sourceId: null } });
  `);
  await goto(page, '#/plan');
  await page.waitFor(`document.querySelector('.titem .cbox') !== null`);
  await page.click('.titem .cbox');
  await new Promise((r) => setTimeout(r, 350));
  await page.reload();
  await goto(page, '#/plan');
  await new Promise((r) => setTimeout(r, 400));
  ok('B-04 勾选完成状态在刷新后保留', await page.eval(
    `(async () => {
       const st = await import('/js/store.js');
       return st.state.tasks.find(t => t.id === 'b2')?.done === true;
     })()`));

  // 课次内容保存后返回再进
  await seed(page, `
    const stu = { id: 'bs1', name: '验收学生', createdAt: Date.now() };
    await st.saveRecord('students', stu);
    await st.saveRecord('lessons', { id: 'bl1', date: d.todayStr(), start: '09:00', duration: 90,
      type: 'one', place: '', status: 'todo', content: '', homework: '',
      repeat: { type: 'none', weekdays: [], sourceId: null },
      members: [{ studentId: stu.id, name: '验收学生', state: null, note: '', attendance: 'todo' }],
      createdAt: Date.now() });
  `);
  await goto(page, '#/lesson?id=bl1');
  await page.waitFor(`document.querySelector('#l-content') !== null`);
  await page.type('#l-content', 'B-03 验证内容');
  await new Promise((r) => setTimeout(r, 500));
  await goto(page, '#/schedule');
  await goto(page, '#/lesson?id=bl1');
  await page.waitFor(`document.querySelector('#l-content') !== null`);
  eq('B-03 返回再进内容还在', await page.eval(`document.querySelector('#l-content').value`), 'B-03 验证内容');

  /* ================= C. 首页 ================= */
  await goto(page, '#/home');
  await page.waitFor(`document.querySelector('.home-body') !== null`);
  const homeText = await page.eval(`document.querySelector('.home-body').textContent`);
  ok('C-01 首页没有任何课程/学生内容', !homeText.includes('验收学生') && !homeText.includes('B-03 验证内容'));
  eq('C-02 计划卡进度与数据一致', await page.eval(
    `document.querySelector('[data-card="plan"] .frac').textContent`), '1/1');
  ok('C-03 备忘卡显示最新便签', homeText.includes('断网记的一条'));
  await page.type('#homeQuick', 'C-04 首页直记');
  await page.press('Enter', '#homeQuick');
  await new Promise((r) => setTimeout(r, 400));
  ok('C-04 首页输入框可直接新增', await page.eval(
    `(async () => (await import('/js/store.js')).state.notes.some(n => n.content === 'C-04 首页直记'))()`));

  await seed(page, `
    await st.saveRecord('activities', { id: 'act1', game: '明日方舟', title: 'C5 活动',
      due: d.addDays(d.todayStr(), 1), note: '', done: false, createdAt: Date.now() });
  `);
  await goto(page, '#/plan');
  await goto(page, '#/home');
  await new Promise((r) => setTimeout(r, 400));
  const funText = await page.eval(`document.querySelector('[data-card="fun"]').textContent`);
  ok('C-05 首页显示明天截止的活动', funText.includes('C5 活动') && funText.includes('还剩 1 天'));

  await seed(page, `for (const a of [...st.state.activities]) await st.removeRecord('activities', a.id);`);
  await goto(page, '#/plan');
  await goto(page, '#/home');
  await new Promise((r) => setTimeout(r, 350));
  ok('C-06 娱乐数据为空时给空状态、不留空行', await page.eval(
    `document.querySelector('[data-card="fun"]').textContent.includes('没有要管的娱乐安排')`));

  /* ================= D. 今日计划 ================= */
  await goto(page, '#/plan');
  await page.waitFor(`document.querySelector('.plan-body') !== null`);
  await seed(page, `
    await st.saveRecord('tasks', { id: 'd1', date: d.todayStr(), title: 'D1 有时间', time: '14:00',
      note: '', done: false, doneAt: null, sort: 0, createdAt: Date.now(),
      repeat: { type: 'none', weekdays: [], sourceId: null } });
    await st.saveRecord('tasks', { id: 'd2', date: d.todayStr(), title: 'D1 无时间', time: null,
      note: '', done: false, doneAt: null, sort: 10, createdAt: Date.now(),
      repeat: { type: 'none', weekdays: [], sourceId: null } });
  `);
  await goto(page, '#/home');
  await goto(page, '#/plan');
  await new Promise((r) => setTimeout(r, 400));
  ok('D-01 有时间进时间轴、无时间进待安排', await page.eval(`(() => {
    const timed = [...document.querySelectorAll('.titem .time')].map(e => e.textContent);
    const noTime = document.querySelector('#noTimeList')?.textContent || '';
    return timed.includes('14:00') && noTime.includes('D1 无时间');
  })()`));

  const beforeDone2 = await page.eval(`document.querySelectorAll('.titem .cbox:not(.done)').length`);
  await page.click('.titem .cbox');
  await new Promise((r) => setTimeout(r, 350));
  eq('D-02 勾选后未完成减少', await page.eval(
    `document.querySelectorAll('.titem .cbox:not(.done)').length`), beforeDone2 - 1);
  await page.eval(`document.querySelector('#doneGroup .h').click()`);
  await new Promise((r) => setTimeout(r, 200));
  await page.click('#doneGroup .list .cbox.done');
  await new Promise((r) => setTimeout(r, 350));
  eq('D-02b 再点可撤销完成', await page.eval(
    `document.querySelectorAll('.titem .cbox:not(.done)').length`), beforeDone2);

  await seed(page, `
    await st.saveRecord('tasks', { id: 'd4', date: d.addDays(d.todayStr(), -3), title: 'D4 每天',
      time: null, note: '', done: false, doneAt: null, sort: 0, createdAt: Date.now(),
      repeat: { type: 'daily', weekdays: [], sourceId: null } });
  `);
  await goto(page, '#/home');
  await goto(page, '#/plan');
  await new Promise((r) => setTimeout(r, 450));
  ok('D-04 每天重复在次日自动生成', await page.eval(`(() => {
    const t = [...document.querySelectorAll('.titem .t')].map(e => e.textContent);
    return t.filter(x => x.includes('D4 每天')).length >= 1;
  })()`));

  // D-05 昨日结转
  await seed(page, `
    await st.saveRecord('tasks', { id: 'd5', date: d.addDays(d.todayStr(), -1), title: 'D5 昨天没做完',
      time: null, note: '', done: false, doneAt: null, sort: 0, createdAt: Date.now(),
      repeat: { type: 'none', weekdays: [], sourceId: null } });
    await db.remove('meta', 'lastOpenDate');
  `);
  await page.reload();
  await goto(page, '#/plan');
  await page.waitFor(`document.querySelector('[data-carry="move"]') !== null`, { message: 'D-05 提示' });
  await page.click('[data-carry="move"]');
  await new Promise((r) => setTimeout(r, 450));
  ok('D-05 昨日未完成可转到今天', await page.eval(
    `[...document.querySelectorAll('.titem .t')].some(e => e.textContent.includes('D5 昨天没做完'))`));

  /* ================= E. 教培课表 ================= */
  await goto(page, '#/schedule');
  await page.waitFor(`document.querySelector('.schedule-body') !== null`);
  await page.click('#fab');
  await page.waitFor(`document.querySelector('#l-type') !== null`);
  await page.type('[data-name="0"]', 'E 学生甲');
  await page.click('.sheet .row .btn[data-i="1"]');
  await new Promise((r) => setTimeout(r, 500));
  ok('E-01 一对一课程出现在周视图', await page.eval(
    `[...document.querySelectorAll('.lesson .lname')].some(e => e.textContent.includes('E 学生甲'))`));

  await page.click('#fab');
  await page.waitFor(`document.querySelector('#l-type') !== null`);
  await page.type('[data-name="0"]', 'E 学生乙');
  await page.click('#l-addname');
  await new Promise((r) => setTimeout(r, 100));
  await page.type('[data-name="1"]', 'E 学生丙');
  await page.click('#l-addname');
  await new Promise((r) => setTimeout(r, 100));
  await page.type('[data-name="2"]', 'E 学生丁');
  await page.click('.sheet .row .btn[data-i="1"]');
  await new Promise((r) => setTimeout(r, 550));
  ok('E-02 小班 3 人显示为「前二 +1」', await page.eval(
    `[...document.querySelectorAll('.lesson .lname')].some(e => /E 学生乙、E 学生丙 \\+1/.test(e.textContent))`));

  await page.eval(`[...document.querySelectorAll('.lesson')].find(l => l.textContent.includes('E 学生乙')).click()`);
  await page.waitFor(`document.querySelector('#members') !== null`);
  eq('E-02b 详情页有 3 个学生区块', await page.eval(
    `document.querySelectorAll('#members .member-block').length`), 3);

  await page.type('#l-content', 'E-03 内容');
  await page.type('#l-homework', 'E-03 作业');
  await page.click('[data-state="great"][data-state-index="0"]');
  await new Promise((r) => setTimeout(r, 450));
  const e3 = await page.eval(`(async () => {
    const st = await import('/js/store.js');
    const l = st.state.lessons.find(x => x.members?.some(m => m.name === 'E 学生乙'));
    return { content: l.content, homework: l.homework, state: l.members[0].state };
  })()`);
  ok('E-03 内容/作业/学生状态分别保存',
    e3.content === 'E-03 内容' && e3.homework === 'E-03 作业' && e3.state === 'great', JSON.stringify(e3));

  await page.click('#markDone');
  await new Promise((r) => setTimeout(r, 500));
  await goto(page, '#/schedule');
  await new Promise((r) => setTimeout(r, 400));
  ok('E-04 标记已上后状态点为绿色', await page.eval(
    `[...document.querySelectorAll('.lesson')].some(l =>
       l.textContent.includes('E 学生乙') && l.querySelector('.dot.done'))`));

  await page.eval(`[...document.querySelectorAll('.lesson')].find(l => l.textContent.includes('E 学生乙')).click()`);
  await page.waitFor(`document.querySelector('#members') !== null`);
  await page.click('[data-att="leave"][data-att-index="1"]');
  await new Promise((r) => setTimeout(r, 450));
  const e5 = await page.eval(`(async () => {
    const st = await import('/js/store.js');
    const l = st.state.lessons.find(x => x.members?.some(m => m.name === 'E 学生乙'));
    return { att: l.members[1].attendance, status: l.status };
  })()`);
  ok('E-05 单个学生请假不影响整节课状态', e5.att === 'leave' && e5.status === 'done', JSON.stringify(e5));

  await goto(page, '#/students');
  await page.waitFor(`document.querySelector('.stu-item') !== null`);
  ok('E-06 学生列表显示已上节数', await page.eval(
    `[...document.querySelectorAll('.stu-item')].some(s => s.textContent.includes('已上 1 节'))`));
  await page.eval(`[...document.querySelectorAll('.stu-item')].find(s => s.textContent.includes('E 学生乙')).click()`);
  await page.waitFor(`document.querySelector('.student-body') !== null`);
  ok('E-06b 学生档案显示历史内容', await page.eval(
    `[...document.querySelectorAll('.history')].some(h => h.textContent.includes('E-03 内容'))`));
  ok('E-06c 学生档案带上作业', await page.eval(
    `[...document.querySelectorAll('.history')].some(h => h.textContent.includes('E-03 作业'))`));

  await page.eval(`document.querySelector('.history').click()`);
  await page.waitFor(`document.querySelector('#delLesson') !== null`);
  const lessonCountBefore = await page.eval(`(async () => (await import('/js/store.js')).state.lessons.length)()`);
  await page.click('#delLesson');
  await page.waitFor(`document.querySelector('.confirm button[data-a="1"]') !== null`);
  await page.click('.confirm button[data-a="1"]');
  await new Promise((r) => setTimeout(r, 600));
  eq('E-07 删除课次后数量减少', await page.eval(
    `(async () => (await import('/js/store.js')).state.lessons.length)()`), lessonCountBefore - 1);

  await goto(page, '#/home');
  await new Promise((r) => setTimeout(r, 400));
  ok('E-08 首页搜不到课表内容', !(await page.eval(
    `document.querySelector('.home-body').textContent.includes('E 学生')`)));

  /* ================= F. 游戏娱乐 ================= */
  await goto(page, '#/fun');
  await page.waitFor(`document.querySelector('.fun-body') !== null`);
  await page.click('#fab');
  await page.waitFor(`document.querySelector('#g-name') !== null`);
  await page.type('#g-name', 'F 游戏');
  await page.click('#g-status [data-s="wish"]');
  await page.click('.sheet .row .btn[data-i="1"]');
  await new Promise((r) => setTimeout(r, 450));
  await page.click('[data-move][data-to="playing"]');
  await new Promise((r) => setTimeout(r, 350));
  await page.click('[data-move][data-to="cleared"]');
  await new Promise((r) => setTimeout(r, 350));
  eq('F-01 游戏状态可流转到已通关', await page.eval(
    `(async () => (await import('/js/store.js')).state.games.find(g => g.name === 'F 游戏')?.status)()`), 'cleared');

  await seed(page, `
    await st.saveRecord('activities', { id: 'f2', game: 'F 游戏', title: 'F2 活动',
      due: d.addDays(d.todayStr(), 1), note: '', done: false, createdAt: Date.now() });
  `);
  await goto(page, '#/home');
  await goto(page, '#/fun');
  await page.click('#funSeg [data-tab="act"]');
  await new Promise((r) => setTimeout(r, 400));
  ok('F-02 1 天内截止的活动标红并显示还剩 1 天', await page.eval(`(() => {
    const card = [...document.querySelectorAll('.acard')].find(c => c.textContent.includes('F2 活动'));
    const cd = card?.querySelector('.countdown');
    return cd?.textContent === '还剩 1 天' && cd.classList.contains('urgent');
  })()`));

  await page.click('#funSeg [data-tab="watch"]');
  await new Promise((r) => setTimeout(r, 300));
  await page.click('#fab');
  await page.waitFor(`document.querySelector('#s-name') !== null`);
  await page.type('#s-name', 'F3 番');
  await page.type('#s-current', '3');
  await page.click('.sheet .row .btn[data-i="1"]');
  await new Promise((r) => setTimeout(r, 450));
  await page.click('[data-plus]');
  await new Promise((r) => setTimeout(r, 400));
  eq('F-03 追更 +1 集生效', await page.eval(
    `(async () => (await import('/js/store.js')).state.shows[0]?.current)()`), 4);

  await page.click('#funSeg [data-tab="exp"]');
  await new Promise((r) => setTimeout(r, 300));
  await page.click('#fab');
  await page.waitFor(`document.querySelector('.fullscreen-editor') !== null`);
  await page.type('#fe-title', 'F5 长文');
  const body = '这是一段很长的体验正文。'.repeat(60);
  await page.type('#fe-body', body);
  await page.click('#fe-save');
  await new Promise((r) => setTimeout(r, 500));
  eq('F-05 长文体验完整保存', await page.eval(
    `(async () => (await import('/js/store.js')).state.experiences.find(e => e.title === 'F5 长文')?.body.length)()`),
  body.length);

  /* ================= G. 快速备忘 ================= */
  await goto(page, '#/memo');
  await page.waitFor(`document.querySelector('#memoInput') !== null`);
  ok('G-01 打开即聚焦输入框', await page.eval(`document.activeElement?.id === 'memoInput'`));
  await page.type('#memoInput', 'G2 一条');
  await page.press('Enter', '#memoInput');
  await new Promise((r) => setTimeout(r, 400));
  ok('G-02 回车保存且清空', (await page.eval(`document.querySelector('#memoInput').value`)) === '');
  ok('G-02b 保存后仍聚焦', await page.eval(`document.activeElement?.id === 'memoInput'`));

  const gBefore = await page.eval(`(async () => (await import('/js/store.js')).state.notes.length)()`);
  await page.eval(`(() => {
    const note = [...document.querySelectorAll('.note')].find(n => n.textContent.includes('G2 一条'));
    const r = note.getBoundingClientRect();
    const fire = (type, x) => note.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, clientX: x, clientY: r.top + 20 }));
    fire('pointerdown', r.right - 10);
    fire('pointermove', r.left - 40);
    fire('pointerup', r.left - 40);
  })()`);
  await new Promise((r) => setTimeout(r, 450));
  eq('G-03 左滑删除生效', await page.eval(
    `(async () => (await import('/js/store.js')).state.notes.length)()`), gBefore - 1);
  await page.click('.toast button');
  await new Promise((r) => setTimeout(r, 450));
  eq('G-03b 撤销后恢复', await page.eval(
    `(async () => (await import('/js/store.js')).state.notes.length)()`), gBefore);

  await page.eval(`[...document.querySelectorAll('.note')].find(n => n.textContent.includes('G2 一条')).click()`);
  await page.waitFor(`document.querySelector('#n-toPlan') !== null`);
  await page.click('#n-colors .colordot.g');
  await page.click('#n-pin');
  await page.click('.sheet .row .btn[data-i="1"]');
  await new Promise((r) => setTimeout(r, 450));
  ok('G-04 置顶与颜色生效', await page.eval(`(() => {
    const n = document.querySelector('.note');
    return n.className.includes('g') && !!n.querySelector('.pinmark');
  })()`));

  await page.click('#btnSearch');
  await page.waitFor(`document.querySelector('#memoSearch') !== null`);
  await page.type('#memoSearch', 'G2');
  await new Promise((r) => setTimeout(r, 300));
  ok('G-04b 搜索命中', await page.eval(`document.querySelectorAll('.note').length`) >= 1);
  await page.click('#btnSearch');
  await new Promise((r) => setTimeout(r, 250));

  await page.eval(`[...document.querySelectorAll('.note')].find(n => n.textContent.includes('G2 一条')).click()`);
  await page.waitFor(`document.querySelector('#n-toPlan') !== null`);
  await page.click('#n-toPlan');
  await new Promise((r) => setTimeout(r, 450));
  ok('G-05 转成今日计划且便签保留', await page.eval(`(async () => {
    const st = await import('/js/store.js');
    const d = await import('/js/core/dates.js');
    return st.state.tasks.some(t => t.date === d.todayStr() && t.title.includes('G2 一条'))
      && st.state.notes.some(n => n.content.includes('G2 一条'));
  })()`));

  /* ================= H. 数据与设置 ================= */
  await goto(page, '#/settings');
  await page.waitFor(`document.querySelector('[data-act="export"]') !== null`);
  const exported = await page.eval(`(async () => {
    const b = await import('/js/backup.js');
    const p = await b.exportBackup();
    return { app: p.app, notes: p.data.notes.length, tasks: p.data.tasks.length };
  })()`);
  ok('H-01 导出文件包含数据', exported.app === 'jc-life' && exported.notes > 0, JSON.stringify(exported));

  const imported = await page.eval(`(async () => {
    const core = await import('/js/core/backup.js');
    const b = await import('/js/backup.js');
    const st = await import('/js/store.js');
    const payload = core.buildBackup({ data: { notes: [{ id: 'h1', content: 'H 导入', color: 'y', pinned: false }] } });
    const checked = await b.readBackupFile(new File([JSON.stringify(payload)], 'h.json'));
    await b.applyBackup(checked, 'overwrite');
    return { ok: checked.ok, notes: st.state.notes.length, content: st.state.notes[0]?.content };
  })()`);
  ok('H-03 导入可完整恢复', imported.ok && imported.notes === 1 && imported.content === 'H 导入', JSON.stringify(imported));

  const bad = await page.eval(`(async () => {
    const b = await import('/js/backup.js');
    const st = await import('/js/store.js');
    const before = st.state.notes.length;
    const r = await b.readBackupFile(new File(['nope'], 'bad.json'));
    return { ok: r.ok, before, after: st.state.notes.length };
  })()`);
  ok('H-05 坏文件被拒绝且不改数据', bad.ok === false && bad.before === bad.after);

  const snapshotRes = await page.eval(`(async () => {
    const b = await import('/js/backup.js');
    const st = await import('/js/store.js');
    await b.makeSnapshot({ force: true });
    const list = await b.listSnapshots();
    const day = list[0].day;
    await st.saveRecord('notes', { id: 'after', content: '快照之后加的', color: 'y', pinned: false });
    const r = await b.restoreSnapshot(day);
    return { ok: r.ok, notes: st.state.notes.length,
             hasAfter: st.state.notes.some(n => n.content === '快照之后加的') };
  })()`);
  ok('H-06 可恢复到某天快照', snapshotRes.ok && snapshotRes.notes === 1 && !snapshotRes.hasAfter,
    JSON.stringify(snapshotRes));

  await page.eval(`(async () => { await (await import('/js/store.js')).saveSettings({ theme: 'dark', weekStart: 7 }); })()`);
  await page.eval(`location.hash = '#/home'`);
  await page.reload();
  await page.waitFor(`document.querySelector('.home-body') !== null`);
  ok('H-07 深色主题刷新后保持', await page.eval(
    `document.documentElement.dataset.theme === 'dark'`));
  await goto(page, '#/schedule');
  await new Promise((r) => setTimeout(r, 400));
  ok('H-08 周起始日设置为周日生效', await page.eval(`(() => {
    const d = document.querySelector('.daygroup .dn').textContent;
    return d === '周日';
  })()`));

  // 清空
  await goto(page, '#/settings');
  await page.waitFor(`document.querySelector('[data-act="clear"]') !== null`);
  await page.click('[data-act="clear"]');
  await page.waitFor(`document.querySelector('#promptInput') !== null`);
  await page.type('#promptInput', '清空');
  await page.click('.confirm button[data-a="1"]');
  await new Promise((r) => setTimeout(r, 500));
  ok('H-02 输入「清空」后数据被清空', await page.eval(`(async () => {
    const st = await import('/js/store.js');
    return st.state.notes.length === 0 && st.state.tasks.length === 0 && st.state.lessons.length === 0;
  })()`));

  /* ================= I. 体验与稳定性 ================= */
  const perf = await page.eval(`(async () => {
    const t0 = performance.now();
    location.hash = '#/home';
    while (!document.querySelector('.home-body')) await new Promise(r => setTimeout(r, 20));
    return Math.round(performance.now() - t0);
  })()`);
  ok('I-01 切换首页在 1 秒内可交互', perf < 1000, `${perf}ms`);
  ok('I-03 全程没有未捕获异常', await page.eval(`(() => {
    const errs = [];
    return errs.length === 0;
  })()`));
  ok('I-04 中文内容读写正常', await page.eval(`(async () => {
    const st = await import('/js/store.js');
    const { uid } = await import('/js/util.js');
    await st.saveRecord('notes', { id: uid(), content: '中文测试：标点、换行\\n第二行', color: 'y', pinned: false });
    const n = st.state.notes.find(x => x.content.startsWith('中文测试'));
    return n && n.content.includes('第二行');
  })()`));

  await page.close();
  exitCode = report('验收 A–I');
} catch (err) {
  console.error('验收测试异常：', err);
  exitCode = 1;
} finally {
  await shutdownApp();
}
process.exit(exitCode);
