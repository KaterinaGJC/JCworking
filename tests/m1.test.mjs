// M1 · 数据层与设置
import { bootApp, shutdownApp, freshPage, goto, ok, eq, report, getOrigin } from './lib.mjs';

let exitCode = 1;
try {
  await bootApp();
  const page = await freshPage();
  await page.send('Page.setDownloadBehavior', { behavior: 'deny' }).catch(() => {});

  // --- 设置页结构 ---
  await goto(page, '#/settings');
  await page.waitFor(`document.querySelector('[data-act="export"]') !== null`, { message: '设置页渲染' });
  ok('设置页有备份入口', await page.eval(`document.querySelector('[data-act="import"]') !== null`));
  ok('设置页有外观设置', await page.eval(`document.querySelector('#themeSeg') !== null`));
  ok('设置页有清空入口', await page.eval(`document.querySelector('[data-act="clear"]') !== null`));

  // --- 写入数据后统计随之变化 ---
  const afterWrite = await page.eval(`(async () => {
    const st = await import('/js/store.js');
    await st.saveRecord('notes', { id: 'n1', content: '第一条便签', color: 'y', pinned: false });
    await st.saveRecord('notes', { id: 'n2', content: '第二条便签', color: 'b', pinned: false });
    await st.saveRecord('tasks', { id: 't1', title: '写计划', date: '2026-10-24' });
    return st.state.notes.length;
  })()`);
  eq('便签已写入内存', afterWrite, 2);

  await goto(page, '#/home');
  await goto(page, '#/settings');
  const noteStat = await page.eval(`(() => {
    const rows = [...document.querySelectorAll('.srow')];
    const r = rows.find(x => x.textContent.includes('便签') && x.textContent.includes('条'));
    return r ? r.textContent.replace(/\\s+/g, '') : '';
  })()`);
  ok('设置页统计显示 2 条便签', noteStat.includes('2条'), noteStat);

  // --- 主题切换与持久化 ---
  await page.click('#themeSeg button[data-theme-val="dark"]');
  await page.waitFor(`document.documentElement.dataset.theme === 'dark'`, { message: '切到深色' });
  ok('深色主题已应用', true);
  const savedTheme = await page.eval(`(async () => {
    const st = await import('/js/store.js');
    return st.state.settings.theme;
  })()`);
  eq('主题写入设置', savedTheme, 'dark');
  // 等待真正落库（否则刷新时可能读到旧设置）
  await page.waitFor(`(async () => {
    const db = await import('/js/db.js');
    const m = await db.getOne('meta', 'settings');
    return m?.value?.theme === 'dark';
  })()`, { message: '主题已落库' });

  await page.reload();
  await page.waitFor(`document.documentElement.dataset.theme === 'dark'`, { message: '刷新后仍是深色' });
  ok('刷新后仍是深色（H-07）', true);

  // --- 周起始日 ---
  await goto(page, '#/settings');
  await page.click('#weekSeg button[data-week-val="7"]');
  const weekStart = await page.eval(`(async () => (await import('/js/store.js')).state.settings.weekStart)()`);
  eq('周起始日保存为周日', weekStart, 7);
  await page.waitFor(`(async () => {
    const db = await import('/js/db.js');
    const m = await db.getOne('meta', 'settings');
    return m?.value?.weekStart === 7;
  })()`, { message: '周起始日已落库' });
  await page.reload();
  const weekStart2 = await page.eval(`(async () => {
    await new Promise(r => setTimeout(r, 400));
    return (await import('/js/store.js')).state.settings.weekStart;
  })()`);
  eq('刷新后周起始日仍是周日（H-08）', weekStart2, 7);

  // --- 刷新后数据仍在（B 组基础） ---
  const notesAfterReload = await page.eval(`(async () => {
    await new Promise(r => setTimeout(r, 300));
    return (await import('/js/store.js')).state.notes.length;
  })()`);
  eq('刷新后便签仍在（B-01）', notesAfterReload, 2);

  // --- 自动快照已生成 ---
  const snaps = await page.eval(`(async () => (await import('/js/backup.js')).listSnapshots())()`);
  ok('启动时自动生成了当天快照', snaps.length >= 1, `共 ${snaps.length} 份`);
  ok('快照结构完整', snaps[0]?.payload?.app === 'jc-life'
    && Array.isArray(snaps[0]?.payload?.data?.notes));

  const forced = await page.eval(`(async () => {
    const b = await import('/js/backup.js');
    await b.makeSnapshot({ force: true });
    const list = await b.listSnapshots();
    return list[0]?.payload?.data?.notes?.length ?? -1;
  })()`);
  eq('强制快照包含当前数据', forced, 2);

  // --- 导出内容正确 ---
  const exported = await page.eval(`(async () => {
    const b = await import('/js/backup.js');
    const payload = await b.exportBackup();
    return { app: payload.app, notes: payload.data.notes.length, theme: payload.settings.theme };
  })()`);
  eq('导出文件 app 标识', exported.app, 'jc-life');
  eq('导出文件包含 2 条便签', exported.notes, 2);
  eq('导出文件带上设置', exported.theme, 'dark');

  // --- 导出按钮点击有反馈 ---
  await goto(page, '#/settings');
  await page.click('[data-act="export"]');
  const toastText = await page.eval(`(() => document.querySelector('.toast')?.textContent || '')()`);
  ok('点导出有提示（H-01）', toastText.includes('导出') || toastText.includes('下载'), toastText);

  // --- 导入：坏文件被拒绝且数据不变 ---
  const badImport = await page.eval(`(async () => {
    const b = await import('/js/backup.js');
    const f = new File(['这不是 json'], 'bad.json', { type: 'application/json' });
    const r = await b.readBackupFile(f);
    const s = await import('/js/store.js');
    return { ok: r.ok, error: r.error, notes: s.state.notes.length };
  })()`);
  eq('坏文件被拒绝（H-05）', badImport.ok, false);
  eq('坏文件不影响现有数据（H-05）', badImport.notes, 2);
  ok('坏文件有可读提示', /读不了|不是有效|JSON/.test(badImport.error || ''), badImport.error);

  // --- 导入：覆盖模式 ---
  const overRes = await page.eval(`(async () => {
    const core = await import('/js/core/backup.js');
    const b = await import('/js/backup.js');
    const st = await import('/js/store.js');
    const payload = core.buildBackup({ data: {
      tasks: [{ id: 'imp1', title: '导入的任务', date: '2026-10-24', done: false }],
      notes: [],
    }});
    const text = JSON.stringify(payload);
    const f = new File([text], 'good.json', { type: 'application/json' });
    const checked = await b.readBackupFile(f);
    if (!checked.ok) return { error: checked.error };
    await b.applyBackup(checked, 'overwrite');
    return { tasks: st.state.tasks.length, notes: st.state.notes.length, title: st.state.tasks[0]?.title };
  })()`);
  eq('导入覆盖：任务数', overRes.tasks, 1);
  eq('导入覆盖：便签被清空', overRes.notes, 0);
  eq('导入覆盖：内容正确', overRes.title, '导入的任务');

  // --- 导入：合并模式 ---
  const mergeRes = await page.eval(`(async () => {
    const core = await import('/js/core/backup.js');
    const b = await import('/js/backup.js');
    const st = await import('/js/store.js');
    await st.saveRecord('notes', { id: 'keep1', content: '本地便签', color: 'g', pinned: false });
    const payload = core.buildBackup({ data: {
      tasks: [{ id: 'imp2', title: '合并进来的', date: '2026-10-24' }],
      notes: [{ id: 'm1', content: '外部便签', color: 'y', pinned: false, updatedAt: Date.now() }],
    }});
    const checked = await b.readBackupFile(new File([JSON.stringify(payload)], 'm.json'));
    await b.applyBackup(checked, 'merge');
    return { tasks: st.state.tasks.length, notes: st.state.notes.length };
  })()`);
  eq('合并：任务累加（H-04）', mergeRes.tasks, 2);
  eq('合并：便签保留并合并（H-04）', mergeRes.notes, 2);

  // --- 快照保留 7 份 ---
  const pruned = await page.eval(`(async () => {
    const db = await import('/js/db.js');
    const b = await import('/js/backup.js');
    for (let i = 0; i < 12; i++) {
      const day = '2026-09-' + String(i + 10).padStart(2, '0');
      await db.put('snapshots', { day, createdAt: Date.now(), payload: { app: 'jc-life', version: 1, data: {} } });
    }
    await b.pruneSnapshots(7);
    const all = await b.listSnapshots();
    return all.length;
  })()`);
  eq('快照只保留最近 7 份', pruned, 7);

  // --- 清空：需要输入"清空" ---
  await goto(page, '#/settings');
  await page.click('[data-act="clear"]');
  await page.waitFor(`document.querySelector('#promptInput') !== null`, { message: '清空确认框' });
  await page.type('#promptInput', '不对');
  await page.click('.confirm button[data-a="1"]');
  const stillThere = await page.eval(`(async () => (await import('/js/store.js')).state.tasks.length)()`);
  eq('输错时不执行清空（H-02）', stillThere, 2);

  await page.click('[data-act="clear"]');
  await page.waitFor(`document.querySelector('#promptInput') !== null`);
  await page.type('#promptInput', '清空');
  await page.click('.confirm button[data-a="1"]');
  await new Promise((r) => setTimeout(r, 400));
  const afterClear = await page.eval(`(async () => {
    const st = await import('/js/store.js');
    return { tasks: st.state.tasks.length, notes: st.state.notes.length };
  })()`);
  eq('清空后任务为 0（H-02）', afterClear.tasks, 0);
  eq('清空后便签为 0（H-02）', afterClear.notes, 0);

  await page.close();
  exitCode = report('M1');
} catch (err) {
  console.error('M1 测试异常：', err);
  exitCode = 1;
} finally {
  await shutdownApp();
}
process.exit(exitCode);
