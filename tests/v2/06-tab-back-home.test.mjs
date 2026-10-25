// 修复项 06：各板块一级界面的返回应直接回首页
import { bootApp, shutdownApp, freshPage, goto, ok, eq, report } from '../lib.mjs';

let exitCode = 1;

const backVisible = (page) => page.eval(
  `!document.querySelector('#btnBack').classList.contains('hidden')`);

try {
  await bootApp();
  const page = await freshPage();

  // 首页没有返回按钮
  await goto(page, '#/home');
  await page.waitFor(`document.querySelector('.home-body') !== null`);
  ok('首页不显示返回按钮', (await backVisible(page)) === false);

  // 三个板块一级界面：都有返回按钮，点了都回首页
  const tabs = [
    ['#/schedule', '.schedule-body', '教培课表'],
    ['#/fun', '.fun-body', '游戏娱乐'],
    ['#/memo', '.memo-body', '快速备忘'],
  ];
  for (const [hash, sel, name] of tabs) {
    await goto(page, hash);
    await page.waitFor(`document.querySelector('${sel}') !== null`, { message: name });
    ok(`「${name}」一级界面显示返回按钮`, await backVisible(page));

    await page.click('#btnBack');
    await new Promise((r) => setTimeout(r, 450));
    eq(`「${name}」点返回回首页`, await page.eval(`location.hash`), '#/home');
    ok(`回首页后首页已渲染`, await page.eval(`document.querySelector('.home-body') !== null`));
  }

  // 详情页仍然回到上一级，不是直接回首页
  await page.eval(`(async () => {
    const st = await import('/js/store.js');
    const d = await import('/js/core/dates.js');
    await st.saveRecord('students', { id: 'bg1', name: '返回首页测试', createdAt: Date.now() });
    await st.saveRecord('lessons', { id: 'bg2', date: d.todayStr(), start: '10:00', duration: 90,
      type: 'one', place: '', status: 'todo', content: '', homework: '',
      repeat: { type: 'none', weekdays: [], sourceId: null },
      members: [{ studentId: 'bg1', name: '返回首页测试', state: null, note: '', attendance: 'todo' }],
      createdAt: Date.now() });
  })()`);

  await goto(page, '#/schedule');
  await page.waitFor(`document.querySelector('.schedule-body') !== null`);
  await goto(page, '#/lesson?id=bg2');
  await page.waitFor(`document.querySelector('#l-content') !== null`);
  ok('详情页也有返回按钮', await backVisible(page));
  await page.click('#btnBack');
  await new Promise((r) => setTimeout(r, 450));
  eq('详情页返回上一级（课表）而不是首页', await page.eval(`location.hash`), '#/schedule');

  // 手机返回键仍按浏览器历史走，不能被 App 的'回首页'逻辑劫持（保证正常切页不受影响）
  await goto(page, '#/fun');
  await page.waitFor(`document.querySelector('.fun-body') !== null`);
  await goto(page, '#/schedule');
  await page.waitFor(`document.querySelector('.schedule-body') !== null`);
  eq('正常切页不会被劫持到首页', await page.eval(`location.hash`), '#/schedule');

  await page.eval(`history.back()`);
  await new Promise((r) => setTimeout(r, 600));
  eq('手机返回键按历史回到上一页', await page.eval(`location.hash`), '#/fun');

  await page.close();
  exitCode = report('修复项 06 · 一级界面返回首页');
} catch (err) {
  console.error('测试异常：', err);
  exitCode = 1;
} finally {
  await shutdownApp();
}
process.exit(exitCode);
