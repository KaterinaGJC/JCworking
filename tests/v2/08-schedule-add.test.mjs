// 修复项 08：教培课表无法新加课程（课表页没有新增入口）
import { bootApp, shutdownApp, freshPage, goto, ok, eq, report } from '../lib.mjs';

let exitCode = 1;

try {
  await bootApp();
  const page = await freshPage();

  await goto(page, '#/schedule');
  await page.waitFor(`document.querySelector('.schedule-body') !== null`, { message: '课表页渲染' });

  // 1. 新增按钮可见
  ok('课表页有新增按钮（右下角 ＋）', await page.eval(`document.querySelector('#fab').hidden === false`));
  eq('按钮语义是「新加一节课」', await page.eval(
    `document.querySelector('#fab').getAttribute('aria-label')`), '新加一节课');

  // 2. 点它打开新建课程表单
  await page.click('#fab');
  const opened = await page.eval(`document.querySelector('#l-type') !== null`);
  ok('点 ＋ 能打开新建课表单', opened);

  // 3. 填一门课并保存，周视图里应该出现
  await page.type('[data-name="0"]', '课表新增测试');
  await page.click('.sheet .row .btn[data-i="1"]');
  await new Promise((r) => setTimeout(r, 600));

  ok('新加的课出现在周视图', await page.eval(
    `[...document.querySelectorAll('.lesson .lname')].some(e => e.textContent.includes('课表新增测试'))`));
  eq('数据里也存下了', await page.eval(
    `(async () => (await import('/js/store.js')).state.lessons.length)()`), 1);

  // 4. 首页和备忘页不该出现这个按钮
  await goto(page, '#/home');
  await new Promise((r) => setTimeout(r, 300));
  ok('首页不显示新增按钮', await page.eval(`document.querySelector('#fab').hidden === true`));

  await goto(page, '#/memo');
  await new Promise((r) => setTimeout(r, 300));
  ok('备忘页不显示新增按钮', await page.eval(`document.querySelector('#fab').hidden === true`));

  // 5. 学生入口仍然可用
  await goto(page, '#/schedule');
  await page.waitFor(`document.querySelector('.schedule-body') !== null`);
  await page.click('#btnStu');
  await new Promise((r) => setTimeout(r, 450));
  eq('课表右上角学生入口仍能进学生列表', await page.eval(`location.hash`), '#/students');

  // 6. 从课表新增时默认日期落在本周
  await goto(page, '#/schedule');
  await page.waitFor(`document.querySelector('#fab') !== null`);
  await page.click('#fab');
  await new Promise((r) => setTimeout(r, 300));
  const defaultDate = await page.eval(`document.querySelector('#l-date').value`);
  const inThisWeek = await page.eval(`(async () => {
    const d = await import('/js/core/dates.js');
    const st = await import('/js/store.js');
    const week = d.weekDates(d.todayStr(), st.state.settings.weekStart === 7 ? 7 : 1);
    return week.includes(${JSON.stringify(defaultDate)});
  })()`);
  ok('新增课程的默认日期在本周内', inThisWeek, defaultDate);

  await page.close();
  exitCode = report('修复项 08 · 课表新增入口');
} catch (err) {
  console.error('测试异常：', err);
  exitCode = 1;
} finally {
  await shutdownApp();
}
process.exit(exitCode);
