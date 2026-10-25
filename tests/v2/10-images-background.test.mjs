// 修复项 10：插入图片 + 设置背景底图
import path from 'node:path';
import { bootApp, shutdownApp, freshPage, goto, ok, eq, report } from '../lib.mjs';

let exitCode = 1;
const IMG = path.resolve('app/icons/icon-192.png');

/**
 * 点某个"选图片"按钮并在系统文件框里选中一张图。
 * 无头浏览器里点 file input 会立刻触发 cancel，所以这里用 CDP 拦截文件选择框。
 */
async function pickImage(page, clickSelector, file = IMG) {
  await page.send('Page.setInterceptFileChooserDialog', { enabled: true }).catch(() => {});
  const chooser = new Promise((resolve) => {
    page.on((m) => { if (m.method === 'Page.fileChooserOpened') resolve(m.params); });
  });
  await page.click(clickSelector);
  const info = await Promise.race([
    chooser,
    new Promise((r) => setTimeout(() => r(null), 4000)),
  ]);
  if (!info) throw new Error(`没有弹出文件选择框：${clickSelector}`);
  await page.send('DOM.setFileInputFiles', { files: [file], backendNodeId: info.backendNodeId });
  await new Promise((r) => setTimeout(r, 200));
}

try {
  await bootApp();
  const page = await freshPage();

  // ---------- 1. 便签加图片 ----------
  await goto(page, '#/memo');
  await page.waitFor(`document.querySelector('#memoInput') !== null`);
  await page.type('#memoInput', '带图片的便签');
  await page.press('Enter', '#memoInput');
  await new Promise((r) => setTimeout(r, 400));

  await page.eval(`document.querySelector('.note').click()`);
  await page.waitFor(`document.querySelector('#n-addimg') !== null`, { message: '便签菜单' });
  ok('便签菜单里有「加图片」入口', true);

  await pickImage(page, '#n-addimg');
  await page.waitFor(`document.querySelectorAll('#n-imgs .img-thumb').length === 1`,
    { message: '缩略图出现' });
  ok('选图后出现缩略图', true);

  const stored = await page.eval(`(async () => {
    const st = await import('/js/store.js');
    const n = st.state.notes[0];
    return { images: n.images || [], blobs: st.state.blobs.length,
             hasData: (st.state.blobs[0]?.dataUrl || '').startsWith('data:image/') };
  })()`);
  eq('便签记录了 1 张图', stored.images.length, 1);
  eq('图片存进了 blobs 表', stored.blobs, 1);
  ok('存的是压缩后的 dataURL', stored.hasData);

  await page.click('.sheet .row .btn[data-i="1"]'); // 保存并关闭
  await new Promise((r) => setTimeout(r, 450));

  ok('便签卡片上显示了图片', await page.eval(
    `document.querySelectorAll('.note .note-imgs img').length === 1`));

  // 点图看大图
  await page.click('.note .note-imgs img');
  await page.waitFor(`document.querySelector('.img-preview') !== null`, { message: '大图' });
  ok('点图片能全屏查看', true);
  await page.click('.img-close');
  await new Promise((r) => setTimeout(r, 200));

  // 刷新后图片还在
  await page.reload();
  await goto(page, '#/memo');
  await page.waitFor(`document.querySelectorAll('.note .note-imgs img').length === 1`,
    { message: '刷新后图片仍在' });
  ok('刷新后图片仍在（存在本地库里）', true);

  // ---------- 2. 课次也能加图片 ----------
  await page.eval(`(async () => {
    const st = await import('/js/store.js');
    const d = await import('/js/core/dates.js');
    await st.saveRecord('students', { id: 'si1', name: '图片测试生', createdAt: Date.now() });
    await st.saveRecord('lessons', { id: 'li1', date: d.todayStr(), start: '09:00', duration: 45,
      slotId: null, type: 'one', place: '', status: 'todo', content: '', homework: '',
      repeat: { type: 'none', weekdays: [], sourceId: null },
      members: [{ studentId: 'si1', name: '图片测试生', state: null, note: '', attendance: 'todo' }],
      createdAt: Date.now() });
  })()`);
  await goto(page, '#/lesson?id=li1');
  await page.waitFor(`document.querySelector('#addLessonImg') !== null`);
  await pickImage(page, '#addLessonImg');
  await page.waitFor(`document.querySelectorAll('#l-imgs .img-thumb').length === 1`,
    { message: '课次图片' });
  const lessonImgs = await page.eval(`(async () => {
    const st = await import('/js/store.js');
    const l = st.state.lessons.find(x => x.id === 'li1');
    return (l.images || []).length;
  })()`);
  eq('课次也存下了图片', lessonImgs, 1);

  // ---------- 3. 设置背景底图 ----------
  await goto(page, '#/settings');
  await page.waitFor(`document.querySelector('[data-act="background"]') !== null`, { message: '背景入口' });
  ok('设置里有「背景底图」', true);

  await page.click('[data-act="background"]');
  await page.waitFor(`document.querySelector('.sheet .row .btn[data-i="1"]') !== null`, { message: '背景面板' });
  await pickImage(page, '.sheet .row .btn[data-i="1"]');
  await page.waitFor(`document.documentElement.classList.contains('has-bg')`, { message: '背景生效' });
  ok('设置背景后页面加了 has-bg 样式', true);
  ok('背景图变量已写入', await page.eval(
    `getComputedStyle(document.documentElement).getPropertyValue('--bg-image').includes('data:image')`));

  const bgName = await page.eval(`(() => {
    const el = document.querySelector('[data-act="background"] .sv');
    return el ? el.textContent.trim() : '';
  })()`);
  eq('设置页显示已设置', bgName, '已设置');

  // 刷新后背景仍生效
  await page.reload();
  await page.waitFor(`document.documentElement.classList.contains('has-bg')`, { message: '刷新后背景仍在' });
  ok('刷新后背景仍然生效', true);

  // ---------- 4. 备份要带上图片 ----------
  const exported = await page.eval(`(async () => {
    const b = await import('/js/backup.js');
    const payload = await b.exportBackup();
    return {
      blobs: payload.data.blobs?.length ?? -1,
      hasUrl: (payload.data.blobs?.[0]?.dataUrl || '').startsWith('data:image/'),
      bg: payload.settings?.backgroundId ? 1 : 0,
    };
  })()`);
  ok('导出备份包含图片数据', exported.blobs >= 1, JSON.stringify(exported));
  ok('导出的是可还原的 dataURL', exported.hasUrl);
  eq('导出包含背景设置', exported.bg, 1);

  // 导入回来能还原图片
  const restored = await page.eval(`(async () => {
    const core = await import('/js/core/backup.js');
    const b = await import('/js/backup.js');
    const st = await import('/js/store.js');
    const payload = await b.exportBackup();
    await b.applyBackup(core.validateBackup(payload), 'overwrite');
    return st.state.blobs.length;
  })()`);
  ok('导入后图片数量一致', restored >= 1, String(restored));

  // ---------- 5. 移除背景 ----------
  await goto(page, '#/settings');
  await page.waitFor(`document.querySelector('[data-act="background"]') !== null`);
  await page.click('[data-act="background"]');
  await page.waitFor(`document.querySelector('.sheet .row .btn[data-i="0"]') !== null`);
  await page.click('.sheet .row .btn[data-i="0"]'); // 移除
  await new Promise((r) => setTimeout(r, 500));
  ok('移除后 has-bg 被清掉', await page.eval(
    `!document.documentElement.classList.contains('has-bg')`));

  await page.close();
  exitCode = report('修复项 10 · 图片与背景');
} catch (err) {
  console.error('测试异常：', err);
  exitCode = 1;
} finally {
  await shutdownApp();
}
process.exit(exitCode);
