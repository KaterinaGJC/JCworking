// 修复项 04：切进备忘板块不该自动进入输入状态（不自动弹键盘）
import { bootApp, shutdownApp, freshPage, goto, ok, eq, report } from '../lib.mjs';

let exitCode = 1;

try {
  await bootApp();
  const page = await freshPage();

  await goto(page, '#/memo');
  await page.waitFor(`document.querySelector('#memoInput') !== null`, { message: '备忘页渲染' });
  await new Promise((r) => setTimeout(r, 250));

  // 1. 刚进来时不能聚焦输入框
  const active = await page.eval(`({
    id: document.activeElement?.id || '',
    tag: document.activeElement?.tagName || '',
  })`);
  ok('进入备忘页不自动聚焦输入框（不弹键盘）', active.id !== 'memoInput', JSON.stringify(active));
  ok('焦点没有落在任何输入控件上', active.tag !== 'TEXTAREA' && active.tag !== 'INPUT', active.tag);

  // 2. 点一下才进入输入状态（用真实鼠标点击，合成事件不会触发浏览器默认的聚焦行为）
  await page.realClick('#memoInput');
  ok('点输入框后才聚焦', await page.eval(`document.activeElement?.id === 'memoInput'`));

  // 3. 输入并回车保存后，焦点保留（方便连着记）
  await page.type('#memoInput', '不自动聚焦验证');
  await page.press('Enter', '#memoInput');
  await new Promise((r) => setTimeout(r, 400));
  eq('回车保存成功', await page.eval(
    `(async () => (await import('/js/store.js')).state.notes.length)()`), 1);
  ok('保存后焦点仍在输入框（可以连续记）',
    await page.eval(`document.activeElement?.id === 'memoInput'`));

  // 4. 离开再回来，仍然不自动聚焦
  await goto(page, '#/home');
  await new Promise((r) => setTimeout(r, 200));
  await goto(page, '#/memo');
  await page.waitFor(`document.querySelector('#memoInput') !== null`);
  await new Promise((r) => setTimeout(r, 250));
  ok('再次进入也不会自动聚焦',
    await page.eval(`document.activeElement?.id !== 'memoInput'`));

  // 5. 空内容点「存」时仍会把焦点给输入框（这是用户的主动动作）
  await page.click('#memoSave');
  ok('点「存」但没内容时，聚焦提示用户写点什么',
    await page.eval(`document.activeElement?.id === 'memoInput'`));

  await page.close();
  exitCode = report('修复项 04 · 备忘不自动聚焦');
} catch (err) {
  console.error('测试异常：', err);
  exitCode = 1;
} finally {
  await shutdownApp();
}
process.exit(exitCode);
