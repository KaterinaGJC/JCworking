// 修复项 05：便签可选颜色太少（4 种 → 8 种）
import { bootApp, shutdownApp, freshPage, goto, ok, eq, report } from '../lib.mjs';

let exitCode = 1;

const openFirstNote = async (page) => {
  await page.eval(`document.querySelector('.note').click()`);
  await page.waitFor(`document.querySelector('#n-colors') !== null`, { message: '便签菜单' });
};

try {
  await bootApp();
  const page = await freshPage();

  await goto(page, '#/memo');
  await page.waitFor(`document.querySelector('#memoInput') !== null`);

  // 建一条便签
  await page.type('#memoInput', '颜色测试');
  await page.press('Enter', '#memoInput');
  await new Promise((r) => setTimeout(r, 400));

  await openFirstNote(page);
  eq('颜色选项数量为 8', await page.eval(
    `document.querySelectorAll('#n-colors .colordot').length`), 8);

  const kinds = await page.eval(
    `[...document.querySelectorAll('#n-colors .colordot')].map(b => b.dataset.color)`);
  eq('八种颜色都在', kinds, ['y', 'o', 'g', 'c', 'b', 'v', 'p', 'n']);

  // 选橙色 → 保存 → 便签上要有对应的类名
  await page.click('#n-colors .colordot.o');
  await page.click('.sheet .row .btn[data-i="1"]');
  await new Promise((r) => setTimeout(r, 450));
  ok('橙色生效（便签带 .o）', await page.eval(`document.querySelector('.note').classList.contains('o')`));

  const stored = await page.eval(`(async () => (await import('/js/store.js')).state.notes[0].color)()`);
  eq('颜色已存到数据里', stored, 'o');

  // 换成灰
  await openFirstNote(page);
  await page.click('#n-colors .colordot.n');
  await page.click('.sheet .row .btn[data-i="1"]');
  await new Promise((r) => setTimeout(r, 450));
  ok('灰色生效（便签带 .n）', await page.eval(`document.querySelector('.note').classList.contains('n')`));

  // 旧的四种颜色依然可用
  await openFirstNote(page);
  await page.click('#n-colors .colordot.b');
  await page.click('.sheet .row .btn[data-i="1"]');
  await new Promise((r) => setTimeout(r, 450));
  ok('原有蓝色仍然可用', await page.eval(`document.querySelector('.note').classList.contains('b')`));

  // 刷新后颜色保持
  await page.reload();
  await goto(page, '#/memo');
  await new Promise((r) => setTimeout(r, 500));
  ok('刷新后颜色保持', await page.eval(`document.querySelector('.note').classList.contains('b')`));

  // 八种颜色都能正常渲染出背景色（不是透明）
  const bgOk = await page.eval(`(async () => {
    const st = await import('/js/store.js');
    const { uid } = await import('/js/util.js');
    const colors = ['y', 'o', 'g', 'c', 'b', 'v', 'p', 'n'];
    for (const c of colors) {
      await st.saveRecord('notes', { id: uid(), content: '底色' + c, color: c, pinned: false, createdAt: Date.now() });
    }
    await new Promise(r => setTimeout(r, 200));
    location.hash = '#/home'; location.hash = '#/memo';
    await new Promise(r => setTimeout(r, 400));
    const out = {};
    for (const el of document.querySelectorAll('.note')) {
      const c = [...el.classList].find(x => colors.includes(x));
      if (c) out[c] = getComputedStyle(el).backgroundColor;
    }
    return out;
  })()`);
  const distinct = new Set(Object.values(bgOk)).size;
  eq('八种颜色背景互相不同', distinct, 8);
  ok('没有透明背景', !Object.values(bgOk).some((v) => v === 'rgba(0, 0, 0, 0)' || v === 'transparent'),
    JSON.stringify(bgOk));

  await page.close();
  exitCode = report('修复项 05 · 便签颜色');
} catch (err) {
  console.error('测试异常：', err);
  exitCode = 1;
} finally {
  await shutdownApp();
}
process.exit(exitCode);
