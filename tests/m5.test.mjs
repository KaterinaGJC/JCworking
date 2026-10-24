// M5 · 教培课表
import { bootApp, shutdownApp, freshPage, goto, ok, eq, report } from './lib.mjs';

let exitCode = 1;

const openNewLesson = async (page) => {
  await page.click('#fab');
  await page.waitFor(`document.querySelector('#l-type') !== null`, { message: '新建课表单' });
};

const addStudentName = async (page, name) => {
  const idx = await page.eval(`document.querySelectorAll('[data-name]').length`);
  if (idx > 0) {
    await page.click('#l-addname');
    await new Promise((r) => setTimeout(r, 120));
  }
  const cur = await page.eval(`document.querySelectorAll('[data-name]').length`);
  await page.type(`[data-name="${cur - 1}"]`, name);
};

try {
  await bootApp();
  const page = await freshPage();

  await goto(page, '#/schedule');
  await page.waitFor(`document.querySelector('.schedule-body') !== null`, { message: '课表渲染' });
  ok('周视图有 7 个日期分组', (await page.eval(`document.querySelectorAll('.daygroup').length`)) === 7);

  // --- E-01 新建一对一 ---
  await openNewLesson(page);
  await page.type('[data-name="0"]', '王小明');
  await page.click('.sheet .row .btn[data-i="1"]');
  await new Promise((r) => setTimeout(r, 500));

  ok('周视图出现该学生（E-01）', await page.eval(
    `[...document.querySelectorAll('.lesson .lname')].some(e => e.textContent.includes('王小明'))`));
  eq('一对一卡片类型标注正确', await page.eval(
    `[...document.querySelectorAll('.lesson')].find(l => l.textContent.includes('王小明')).querySelector('.type').textContent`),
  '一对一');
  ok('新课时状态点为未上（灰）', await page.eval(
    `!document.querySelector('.lesson .dot').classList.contains('done')`));

  // --- E-02 新建小班（3 人）---
  await openNewLesson(page);
  await addStudentName(page, '李雷');
  await addStudentName(page, '韩梅梅');
  await addStudentName(page, '张三');
  await page.click('.sheet .row .btn[data-i="1"]');
  await new Promise((r) => setTimeout(r, 500));

  const smallCard = await page.eval(`(() => {
    const l = [...document.querySelectorAll('.lesson')].find(x => x.textContent.includes('李雷'));
    return l ? { name: l.querySelector('.lname').textContent, type: l.querySelector('.type').textContent } : null;
  })()`);
  eq('小班卡片人数溢出显示 +1（E-02）', smallCard?.name, '李雷、韩梅梅 +1');
  eq('小班类型标注正确（E-02）', smallCard?.type, '小班');

  // --- 打开小班课详情，检查每人一行 ---
  await page.eval(`[...document.querySelectorAll('.lesson')]
    .find(l => l.textContent.includes('李雷')).click()`);
  await page.waitFor(`document.querySelector('#members') !== null`, { message: '课次详情' });
  eq('详情页有 3 个学生区块（E-02）', await page.eval(
    `document.querySelectorAll('#members .member-block').length`), 3);
  eq('每个学生都有状态标签', await page.eval(
    `document.querySelectorAll('#members .member-block').length ===
     [...document.querySelectorAll('#members .member-block')]
       .filter(b => b.querySelectorAll('[data-state]').length === 4).length ? 3 : 0`), 3);

  // --- E-03 填内容 / 作业 / 逐人状态 ---
  await page.type('#l-content', '二次函数顶点式推导');
  await page.type('#l-homework', '练习册 P32-34');
  await page.click('[data-state="great"][data-state-index="0"]');
  await new Promise((r) => setTimeout(r, 300));
  await page.click('[data-state="need"][data-state-index="2"]');
  await new Promise((r) => setTimeout(r, 300));

  const savedLesson = await page.eval(`(async () => {
    const st = await import('/js/store.js');
    return st.state.lessons.find(l => l.members?.some(m => m.name === '张三'));
  })()`);
  eq('主要内容已保存（E-03）', savedLesson.content, '二次函数顶点式推导');
  eq('作业已保存（E-03）', savedLesson.homework, '练习册 P32-34');
  eq('第 1 个学生状态为很好', savedLesson.members[0].state, 'great');
  eq('第 3 个学生状态为需加强', savedLesson.members[2].state, 'need');
  ok('整节课只有一份内容（不是每人一份）',
    savedLesson.members.every((m) => m.content === undefined));

  // --- E-05 单独请假 ---
  await page.click('[data-att="leave"][data-att-index="1"]');
  await new Promise((r) => setTimeout(r, 350));
  const afterLeave = await page.eval(`(async () => {
    const st = await import('/js/store.js');
    const l = st.state.lessons.find(x => x.members?.some(m => m.name === '张三'));
    return { att: l.members[1].attendance, status: l.status };
  })()`);
  eq('该生考勤变成请假（E-05）', afterLeave.att, 'leave');
  eq('课次整体状态仍是未上（E-05）', afterLeave.status, 'todo');

  // --- E-04 标记已上课 ---
  await page.click('#markDone');
  await new Promise((r) => setTimeout(r, 450));
  const afterDone = await page.eval(`(async () => {
    const st = await import('/js/store.js');
    const l = st.state.lessons.find(x => x.members?.some(m => m.name === '张三'));
    return { status: l.status, att: l.members.map(m => m.attendance) };
  })()`);
  eq('课次状态变为已上（E-04）', afterDone.status, 'done');
  ok('其余学生考勤随之变成已上', afterDone.att[0] === 'done' && afterDone.att[2] === 'done');
  eq('请假的学生保持请假（E-05）', afterDone.att[1], 'leave');

  // --- 周视图状态点变绿 ---
  await goto(page, '#/schedule');
  await page.waitFor(`document.querySelector('.schedule-body') !== null`);
  await new Promise((r) => setTimeout(r, 300));
  ok('周视图对应課卡状态点变绿（E-04）', await page.eval(
    `[...document.querySelectorAll('.lesson')].some(l =>
       l.textContent.includes('李雷') && l.querySelector('.dot.done') !== null)`));

  // --- E-06 学生列表与档案 ---
  await goto(page, '#/students');
  await page.waitFor(`document.querySelector('.stu-item') !== null`, { message: '学生列表' });
  const stuCount = await page.eval(`document.querySelectorAll('.stu-item').length`);
  eq('学生名录有 4 人（E-06）', stuCount, 4);
  const wangRow = await page.eval(`(() => {
    const r = [...document.querySelectorAll('.stu-item')].find(x => x.textContent.includes('王小明'));
    return r ? r.textContent.replace(/\\s+/g, '') : '';
  })()`);
  ok('学生列表显示已上节数（E-06）', /已上\d+节/.test(wangRow), wangRow);

  await page.eval(`[...document.querySelectorAll('.stu-item')]
    .find(x => x.textContent.includes('李雷')).click()`);
  await page.waitFor(`document.querySelector('.student-body') !== null`, { message: '学生档案' });
  ok('档案页显示累计已上（E-06）', await page.eval(
    `document.querySelector('.statrow .stat .n').textContent === '1'`));
  ok('档案时间线里有这节课的内容（E-06）', await page.eval(
    `[...document.querySelectorAll('.history')].some(h => h.textContent.includes('二次函数'))`));
  ok('档案里带上作业', await page.eval(
    `[...document.querySelectorAll('.history')].some(h => h.textContent.includes('P32-34'))`));

  await page.eval(`document.querySelector('.history').click()`);
  await page.waitFor(`document.querySelector('#l-content') !== null`, { message: '从档案点回课次' });
  ok('点历史可以回到课次详情', (await page.eval(`document.querySelector('#l-content').value`)).includes('二次函数'));

  // --- 姓名可编辑（改名同步历史）---
  await page.eval(`(() => {
    const el = document.querySelector('[data-name="0"]');
    el.focus();
    el.value = '李雷（改）';
    el.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await new Promise((r) => setTimeout(r, 450));
  const renamed = await page.eval(`(async () => {
    const st = await import('/js/store.js');
    return {
      roster: st.state.students.some(s => s.name === '李雷（改）'),
      inLesson: st.state.lessons.some(l => l.members?.some(m => m.name === '李雷（改）')),
    };
  })()`);
  ok('改名后学生名录同步', renamed.roster);
  ok('改名后历史课次同步', renamed.inLesson);

  // --- E-07 删除课次 ---
  const beforeDelete = await page.eval(`(async () => (await import('/js/store.js')).state.lessons.length)()`);
  await page.click('#delLesson');
  await page.waitFor(`document.querySelector('.confirm button[data-a="1"]') !== null`, { message: '删除确认' });
  await page.click('.confirm button[data-a="1"]');
  await new Promise((r) => setTimeout(r, 600));
  eq('删除后课次少一节（E-07）', await page.eval(
    `(async () => (await import('/js/store.js')).state.lessons.length)()`), beforeDelete - 1);
  ok('删除后回到周视图', await page.eval(`location.hash === '#/schedule'`));

  // --- 重复课：每周生成 ---
  await goto(page, '#/schedule');
  await page.waitFor(`document.querySelector('.schedule-body') !== null`);
  await openNewLesson(page);
  await page.type('[data-name="0"]', '重复课学生');
  await page.click('#l-repeat [data-rep="weekly"]');
  await page.click('.sheet .row .btn[data-i="1"]');
  await new Promise((r) => setTimeout(r, 500));
  await page.click('[data-week="1"]');
  await new Promise((r) => setTimeout(r, 600));
  ok('下一周自动生成重复课（E 组）', await page.eval(
    `[...document.querySelectorAll('.lesson .lname')].some(e => e.textContent.includes('重复课学生'))`));
  const firstWeekCount = await page.eval(`(async () => {
    const st = await import('/js/store.js');
    return st.state.lessons.filter(l => l.repeat?.sourceId).length;
  })()`);
  eq('重复实例只生成一份', firstWeekCount, 1);

  // --- 刷新后仍在 ---
  await page.reload();
  await goto(page, '#/schedule');
  await new Promise((r) => setTimeout(r, 600));
  ok('刷新后课表仍在', (await page.eval(`document.querySelectorAll('.lesson').length`)) >= 1);

  await page.close();
  exitCode = report('M5');
} catch (err) {
  console.error('M5 测试异常：', err);
  exitCode = 1;
} finally {
  await shutdownApp();
}
process.exit(exitCode);
