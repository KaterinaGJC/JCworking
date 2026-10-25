// M3 · 快速备忘
import { bootApp, shutdownApp, freshPage, goto, ok, eq, report } from './lib.mjs';

let exitCode = 1;

const notesInDb = (page) => page.eval(`(async () => (await import('/js/store.js')).state.notes.length)()`);

try {
  await bootApp();
  const page = await freshPage();

  await goto(page, '#/memo');
  await page.waitFor(`document.querySelector('#memoInput') !== null`, { message: '备忘页渲染' });

  // --- G-01 打开即聚焦 ---
  // 需求在 v2 变更：进入备忘页不再自动聚焦（避免一进来就弹键盘），点一下才开始输入
  ok('进入备忘页不自动聚焦（v2 需求）',
    await page.eval(`document.activeElement?.id !== 'memoInput'`));
  await page.realClick('#memoInput');
  ok('点输入框后可开始输入（G-01）',
    await page.eval(`document.activeElement?.id === 'memoInput'`));

  // --- G-02 回车保存、清空、焦点保留 ---
  await page.type('#memoInput', '买电池');
  await page.press('Enter', '#memoInput');
  await new Promise((r) => setTimeout(r, 350));
  eq('回车后保存成功（G-02）', await notesInDb(page), 1);
  ok('输入框已清空（G-02）', (await page.eval(`document.querySelector('#memoInput').value`)) === '');
  ok('保存后焦点仍在输入框（G-02）',
    await page.eval(`document.activeElement?.id === 'memoInput'`));
  ok('便签出现在墙上', await page.eval(`[...document.querySelectorAll('.note .nt')]
    .some(e => e.textContent.includes('买电池'))`));

  // 连着记第二条
  await page.type('#memoInput', '问一下周四调课');
  await page.press('Enter', '#memoInput');
  await new Promise((r) => setTimeout(r, 350));
  eq('可以连续记录（G-02）', await notesInDb(page), 2);

  // --- G-04 颜色 / 置顶 ---
  await page.eval(`[...document.querySelectorAll('.note')]
    .find(n => n.textContent.includes('买电池')).click()`);
  await page.waitFor(`document.querySelector('#n-content') !== null`, { message: '便签菜单' });
  await page.click('#n-colors .colordot.b');
  await page.click('#n-pin');
  ok('置顶按钮已切换文案', (await page.eval(`document.querySelector('#n-pin').textContent`)).includes('取消置顶'));
  await page.click('.sheet .row .btn[data-i="1"]');
  await new Promise((r) => setTimeout(r, 350));

  const pinnedFirst = await page.eval(`(() => {
    const n = [...document.querySelectorAll('.note')];
    return n[0] ? n[0].className.includes('b') : false;
  })()`);
  ok('置顶并变蓝的便签排在最前（G-04）', pinnedFirst);
  ok('置顶标记出现（G-04）', await page.eval(
    `document.querySelector('.note .pinmark') !== null`));

  // --- G-04 搜索 ---
  await page.click('#btnSearch');
  await page.waitFor(`document.querySelector('#memoSearch') !== null`, { message: '搜索框' });
  await page.type('#memoSearch', '周四');
  await new Promise((r) => setTimeout(r, 250));
  eq('搜索只剩 1 条（G-04）', await page.eval(`document.querySelectorAll('.note').length`), 1);
  await page.type('#memoSearch', '不存在的东西');
  await new Promise((r) => setTimeout(r, 250));
  ok('搜不到时给空状态', await page.eval(`document.querySelector('.empty') !== null`));

  await page.click('#btnSearch'); // 关闭搜索
  await new Promise((r) => setTimeout(r, 300));
  eq('关闭搜索后恢复全部', await page.eval(`document.querySelectorAll('.note').length`), 2);

  // --- G-06 长内容不溢出 ---
  const longText = '这是一段很长的备忘内容，用来检查便签卡片在内容很多的时候会不会撑破布局。'.repeat(4);
  await page.eval(`(() => {
    const ta = document.querySelector('#memoInput');
    ta.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, ${JSON.stringify(longText)});
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await page.click('#memoSave');
  await new Promise((r) => setTimeout(r, 350));
  const overflow = await page.eval(`(() => {
    const notes = [...document.querySelectorAll('.note')];
    const target = notes.find(n => n.textContent.includes('这是一段很长'));
    if (!target) return { error: 'not-found', n: notes.length };
    const r = target.getBoundingClientRect();
    const host = target.parentElement.getBoundingClientRect();
    return { w: r.width, hostW: host.width, h: r.height, scrollW: target.scrollWidth, clientW: target.clientWidth };
  })()`);
  ok('长内容便签不横向溢出（G-06）',
    !overflow.error && overflow.w <= overflow.hostW + 1 && overflow.scrollW <= overflow.clientW + 1,
    JSON.stringify(overflow));

  // --- G-05 设为今日计划 ---
  await page.eval(`[...document.querySelectorAll('.note')]
    .find(n => n.textContent.includes('问一下周四调课')).click()`);
  await page.waitFor(`document.querySelector('#n-toPlan') !== null`);
  await page.click('#n-toPlan');
  await new Promise((r) => setTimeout(r, 400));
  const planRes = await page.eval(`(async () => {
    const st = await import('/js/store.js');
    const d = await import('/js/core/dates.js');
    return {
      tasks: st.state.tasks.filter(t => t.date === d.todayStr() && t.title.includes('周四调课')).length,
      notes: st.state.notes.filter(n => n.content.includes('周四调课')).length,
    };
  })()`);
  eq('生成了一条今日待办（G-05）', planRes.tasks, 1);
  eq('原便签仍保留（G-05）', planRes.notes, 1);

  // --- G-03 左滑删除 + 撤销 ---
  const beforeSwipe = await notesInDb(page);
  await page.eval(`(() => {
    const note = [...document.querySelectorAll('.note')].find(n => n.textContent.includes('买电池'));
    const r = note.getBoundingClientRect();
    const fire = (type, x, y) => note.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, clientX: x, clientY: y,
    }));
    fire('pointerdown', r.left + r.width - 20, r.top + r.height / 2);
    fire('pointermove', r.left + r.width - 90, r.top + r.height / 2);
    fire('pointermove', r.left - 60, r.top + r.height / 2);
    fire('pointerup', r.left - 60, r.top + r.height / 2);
  })()`);
  await new Promise((r) => setTimeout(r, 450));
  eq('左滑后便签被删除（G-03）', await notesInDb(page), beforeSwipe - 1);
  ok('出现撤销提示（G-03）', await page.eval(`document.querySelector('.toast button') !== null`));
  await page.click('.toast button');
  await new Promise((r) => setTimeout(r, 450));
  eq('撤销后恢复（G-03）', await notesInDb(page), beforeSwipe);

  // --- 持久化 ---
  const beforeReload = await notesInDb(page);
  await page.reload();
  await goto(page, '#/memo');
  await new Promise((r) => setTimeout(r, 500));
  eq('刷新后便签仍在（B-01）', await notesInDb(page), beforeReload);
  eq('刷新后界面显示同样数量', await page.eval(`document.querySelectorAll('.note').length`), beforeReload);

  await page.close();
  exitCode = report('M3');
} catch (err) {
  console.error('M3 测试异常：', err);
  exitCode = 1;
} finally {
  await shutdownApp();
}
process.exit(exitCode);
