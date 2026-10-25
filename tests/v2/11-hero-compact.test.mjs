// 问题 11：主界面顶部视图显示栏太长 → 改短
// 复现点：hero 区域（日期 + 摘要）应紧凑、摘要单行显示不折行。
import { bootApp, shutdownApp, freshPage, goto, ok, eq, report } from '../lib.mjs';

let exitCode = 1;

try {
  await bootApp();
  const page = await freshPage();

  // 造多条数据，让摘要拼接得最长（最容易暴露"太长"）
  await page.eval(`(async () => {
    const st = await import('/js/store.js');
    const d = await import('/js/core/dates.js');
    const t = d.todayStr();
    for (let i = 0; i < 5; i++) {
      await st.saveRecord('tasks', { id: 't' + i, date: t, title: '事' + i, time: '', done: false });
    }
    await st.saveRecord('activities', { id: 'a1', game: 'G', title: '活动一', due: t, done: false });
    await st.saveRecord('shows', { id: 's1', name: '番一', weekday: d.weekdayIndex1(t), current: 3, total: 20, kind: 'anime' });
  })()`);

  await goto(page, '#/plan');
  await new Promise((r) => setTimeout(r, 200));
  await goto(page, '#/home');
  await page.waitFor(`document.querySelector('#homeSummary') !== null`, { message: '首页 hero 渲染' });
  await new Promise((r) => setTimeout(r, 200));

  const geo = await page.eval(`(() => {
    const hero = document.querySelector('.hero');
    const sum = document.querySelector('#homeSummary');
    return {
      heroH: Math.round(hero.getBoundingClientRect().height),
      sumH: Math.round(sum.getBoundingClientRect().height),
      sumWrap: getComputedStyle(sum).whiteSpace,
      sumText: sum.textContent,
    };
  })()`);

  // 摘要应包含关键数字（信息不丢）
  ok('摘要仍写明 5 件事', geo.sumText.includes('5 件事'), JSON.stringify(geo));
  ok('摘要仍写明活动今天截止', geo.sumText.includes('今天截止'), JSON.stringify(geo));
  ok('摘要仍写明番今天更新', geo.sumText.includes('今天更新'), JSON.stringify(geo));

  // 顶部显示栏改短：单行、不换行、整体高度紧凑
  eq('摘要强制单行（nowrap）', geo.sumWrap, 'nowrap');
  ok('摘要渲染为单行高度（≤24px）', geo.sumH <= 24, `sumH=${geo.sumH}`);
  ok('hero 总高度改短（≤72px）', geo.heroH <= 72, `heroH=${geo.heroH}`);

  // 空状态时也不应留大块空白
  await page.eval(`(async () => {
    const st = await import('/js/store.js');
    for (const t of [...st.state.tasks]) await st.removeRecord('tasks', t.id);
    for (const a of [...st.state.activities]) await st.removeRecord('activities', a.id);
    for (const s of [...st.state.shows]) await st.removeRecord('shows', s.id);
  })()`);
  await goto(page, '#/plan');
  await new Promise((r) => setTimeout(r, 200));
  await goto(page, '#/home');
  await page.waitFor(`document.querySelector('#homeSummary') !== null`);
  await new Promise((r) => setTimeout(r, 200));
  const empty = await page.eval(`(() => {
    const hero = document.querySelector('.hero');
    return { h: Math.round(hero.getBoundingClientRect().height), text: document.querySelector('#homeSummary').textContent };
  })()`);
  ok('空状态摘要保留"今天没有安排"', empty.text.includes('今天没有安排'), empty.text);
  ok('空状态 hero 同样紧凑（≤72px）', empty.h <= 72, `h=${empty.h}`);

  await page.close();
  exitCode = report('问题 11 · 顶部显示栏改短');
} catch (err) {
  console.error('测试异常：', err);
  exitCode = 1;
} finally {
  await shutdownApp();
}
process.exit(exitCode);
