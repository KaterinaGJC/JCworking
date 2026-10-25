// 修复项 03：返回键要先收起弹层、按层级返回，不能把整个页面退掉
import { bootApp, shutdownApp, freshPage, goto, ok, eq, report } from '../lib.mjs';

let exitCode = 1;

try {
  await bootApp();
  const page = await freshPage();

  // ---------- 1. 首页计划区：打开新增面板后按返回，应关面板、留在首页 ----------
  await goto(page, '#/plan');
  await page.waitFor(`document.querySelector('.plan-body') !== null`);
  await page.click('[data-card="plan"] [data-plan-add]');
  await page.waitFor(`document.querySelector('#f-title') !== null`, { message: '面板打开' });

  await page.eval(`history.back()`);
  await new Promise((r) => setTimeout(r, 400));
  ok('按返回键先收起面板', await page.eval(`document.querySelector('.sheet-mask') === null`));
  eq('收起面板后仍停在计划页', await page.eval(`location.hash`), '#/plan');
  ok('计划页内容还在', await page.eval(`document.querySelector('.plan-body') !== null`));

  // ---------- 2. 课次详情：打开「改时间」面板后按返回 ----------
  await page.eval(`(async () => {
    const st = await import('/js/store.js');
    const d = await import('/js/core/dates.js');
    await st.saveRecord('students', { id: 'bz1', name: '返回测试生', createdAt: Date.now() });
    await st.saveRecord('lessons', { id: 'bl1', date: d.todayStr(), start: '09:00', duration: 90,
      type: 'one', place: '', status: 'todo', content: '', homework: '',
      repeat: { type: 'none', weekdays: [], sourceId: null },
      members: [{ studentId: 'bz1', name: '返回测试生', state: null, note: '', attendance: 'todo' }],
      createdAt: Date.now() });
  })()`);
  await goto(page, '#/lesson?id=bl1');
  await page.waitFor(`document.querySelector('#l-time') !== null`);
  await page.click('#l-time');
  await page.waitFor(`document.querySelector('#t-date') !== null`, { message: '改时间面板' });

  await page.eval(`history.back()`);
  await new Promise((r) => setTimeout(r, 400));
  ok('详情页按返回先收面板', await page.eval(`document.querySelector('.sheet-mask') === null`));
  eq('收面板后仍在课次详情', await page.eval(`location.hash`), '#/lesson?id=bl1');

  // ---------- 3. 详情页没有弹层时，返回到上一级列表，而不是别的 tab ----------
  // 先绕到别的 tab，再进详情，模拟"历史里有别的页面"
  await goto(page, '#/fun');
  await new Promise((r) => setTimeout(r, 300));
  await goto(page, '#/lesson?id=bl1');
  await page.waitFor(`document.querySelector('#l-content') !== null`);

  await page.click('#btnBack');
  await new Promise((r) => setTimeout(r, 500));
  eq('课次详情返回到课表（不是上一个 tab）', await page.eval(`location.hash`), '#/schedule');

  // ---------- 4. 学生档案 → 学生列表 → 课表 三级 ----------
  await goto(page, '#/student?id=bz1');
  await page.waitFor(`document.querySelector('.student-body') !== null`);
  await page.click('#btnBack');
  await new Promise((r) => setTimeout(r, 400));
  eq('学生档案返回到学生列表', await page.eval(`location.hash`), '#/students');

  await page.click('#btnBack');
  await new Promise((r) => setTimeout(r, 400));
  eq('学生列表返回到课表', await page.eval(`location.hash`), '#/schedule');

  // ---------- 5. 设置页返回首页 ----------
  await goto(page, '#/settings');
  await page.waitFor(`document.querySelector('.sgroup') !== null`);
  await page.click('#btnBack');
  await new Promise((r) => setTimeout(r, 400));
  eq('设置页返回到首页', await page.eval(`location.hash`), '#/home');

  // ---------- 6. 确认框也能被返回键收掉 ----------
  await goto(page, '#/settings');
  await page.waitFor(`document.querySelector('[data-act="clear"]') !== null`);
  await page.click('[data-act="clear"]');
  await page.waitFor(`document.querySelector('#promptInput') !== null`);
  await page.eval(`history.back()`);
  await new Promise((r) => setTimeout(r, 400));
  ok('确认框也能被返回键收掉', await page.eval(`document.querySelector('.confirm') === null`));
  eq('收掉确认框后仍在设置页', await page.eval(`location.hash`), '#/settings');

  await page.close();
  exitCode = report('修复项 03 · 返回键层级');
} catch (err) {
  console.error('测试异常：', err);
  exitCode = 1;
} finally {
  await shutdownApp();
}
process.exit(exitCode);
