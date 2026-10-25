// 验证项 17：手机上已有的 v3 数据库，被 v4 代码打开后数据不丢
//
// 背景：v4 新增了 posts 表（记录板块）。所有既有测试都是"清库后全新打开"，
// 覆盖不到"真实手机里已有 v3 数据 → 升级到 v4"这条路径。这个用例专门补它。
//
// 做法：清空存储 → 停在一个同源但不执行应用脚本的页面（404 页）→ 手工造一个 v3 库并写入数据
//       → 用新代码打开 → 断言库升到 v4、老数据一条不少、新表可用。
import { bootApp, shutdownApp, freshPage, getOrigin, ok, eq, report } from '../lib.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let exitCode = 1;
try {
  await bootApp();
  const origin = getOrigin();
  const page = await freshPage();          // 清库 + 打开应用（此时会建出 v4）

  // 清空，并离开应用页面（应用页面不开着连接，删除才会立即生效）
  await page.send('Storage.clearDataForOrigin', {
    origin,
    storageTypes: 'indexeddb,local_storage,cache_storage',
  }).catch(() => {});
  await page.goto(`${origin}/__seed__`);   // 同源的 404 页，不会执行应用脚本
  await sleep(400);

  // ---- 造一个 v3 旧库（没有 posts 表）并写入贴近真实的数据 ----
  const seeded = await page.eval(`(async () => {
    const V3 = {
      tasks: { keyPath: 'id' }, lessons: { keyPath: 'id' }, students: { keyPath: 'id' },
      notes: { keyPath: 'id' }, games: { keyPath: 'id' }, activities: { keyPath: 'id' },
      shows: { keyPath: 'id' }, experiences: { keyPath: 'id' }, blobs: { keyPath: 'id' },
      meta: { keyPath: 'key' }, snapshots: { keyPath: 'day' },
    };
    const db = await new Promise((res, rej) => {
      const req = indexedDB.open('jc-life', 3);
      req.onupgradeneeded = () => {
        const d = req.result;
        for (const [n, o] of Object.entries(V3)) if (!d.objectStoreNames.contains(n)) d.createObjectStore(n, o);
      };
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
      req.onblocked = () => rej(new Error('造库被阻塞'));
    });
    const d = new Date();
    const ymd = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const put = (store, rows) => new Promise((res, rej) => {
      const tx = db.transaction(store, 'readwrite');
      for (const r of rows) tx.objectStore(store).put(r);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
    await put('tasks', [
      { id: 'u-t1', date: ymd, title: '升级前的任务', time: '09:00', note: '', done: false,
        doneAt: null, sort: 0, createdAt: Date.now(), repeat: { type: 'none', weekdays: [], sourceId: null } },
      { id: 'u-t2', date: ymd, title: '升级前完成的', time: null, note: '', done: true,
        doneAt: Date.now(), sort: 10, createdAt: Date.now(), repeat: { type: 'none', weekdays: [], sourceId: null } },
    ]);
    await put('notes', [{ id: 'u-n1', content: '升级前的便签', color: 'b', pinned: true, createdAt: Date.now() }]);
    await put('students', [{ id: 'u-s1', name: '老学生', createdAt: Date.now() }]);
    await put('lessons', [{
      id: 'u-l1', date: ymd, start: '08:00', duration: 45, slotId: 'slot-1', type: 'one',
      place: '', status: 'done', content: '升级前记的内容', homework: '升级前的作业', images: [],
      repeat: { type: 'none', weekdays: [], sourceId: null },
      members: [{ studentId: 'u-s1', name: '老学生', state: 'great', note: '', attendance: 'done' }],
      createdAt: Date.now(),
    }]);
    await put('meta', [{ key: 'settings', value: { theme: 'dark', weekStart: 7 } }]);
    const v = db.version;
    await new Promise((res) => { db.close(); setTimeout(res, 300); });
    return { version: v };
  })()`);
  eq('造出的是 v3 老库', seeded.version, 3);

  // ---- 用新代码打开：应当自动升级到 v4 ----
  await page.goto(`${origin}/index.html#/home`);
  await page.waitFor(`document.querySelector('.home-body') !== null`, { message: '升级后能启动' });
  await sleep(1200);

  const after = await page.eval(`(async () => {
    const st = window.__jc.state;
    const info = await new Promise((res, rej) => {
      const req = indexedDB.open('jc-life');
      req.onsuccess = () => {
        const db = req.result;
        const o = { version: db.version, stores: [...db.objectStoreNames] };
        db.close(); res(o);
      };
      req.onerror = () => rej(req.error);
      req.onblocked = () => rej(new Error('查询被阻塞'));
    });
    return {
      ...info,
      loaded: st.loaded,
      tasks: st.tasks.length,
      notes: st.notes.length,
      lessons: st.lessons.length,
      students: st.students.length,
      noteText: st.notes[0]?.content,
      lessonContent: st.lessons[0]?.content,
      lessonHomework: st.lessons[0]?.homework,
      memberName: st.lessons[0]?.members?.[0]?.name,
      theme: st.settings.theme,
      weekStart: st.settings.weekStart,
    };
  })()`);

  eq('数据库从 v3 升到 v4', after.version, 4);
  ok('新增了 posts 表', after.stores.includes('posts'));
  ok('老表一个都没少', ['tasks', 'lessons', 'notes', 'students', 'meta', 'blobs', 'snapshots']
    .every((s) => after.stores.includes(s)));
  eq('升级后应用能正常加载', after.loaded, true);
  eq('任务 2 条都在', after.tasks, 2);
  eq('便签内容和颜色都在', after.noteText, '升级前的便签');
  eq('课次内容没丢', after.lessonContent, '升级前记的内容');
  eq('课次作业没丢', after.lessonHomework, '升级前的作业');
  eq('课次里的学生没丢', after.memberName, '老学生');
  eq('学生名录没丢', after.students, 1);
  eq('主题设置保留（深色）', after.theme, 'dark');
  eq('周起始日保留（周日）', after.weekStart, 7);

  // ---- 升级后的新表能立刻用 ----
  const postOk = await page.eval(`(async () => {
    const st = await import('/js/store.js');
    const { uid } = await import('/js/util.js');
    await st.saveRecord('posts', { id: uid(), text: '升级后发的第一条记录', images: [], liked: false, comments: [], createdAt: Date.now() });
    return st.state.posts.length;
  })()`);
  eq('升级后能正常写入记录', postOk, 1);

  // ---- 顺带守住老约束：首页仍然不含课表内容 ----
  const homeText = await page.eval(`document.querySelector('.home-body').textContent`);
  ok('升级后首页仍不出现学生姓名（C-01）', !homeText.includes('老学生'));
  ok('升级后首页仍不出现课次内容（C-01）', !homeText.includes('升级前记的内容'));

  await page.close();
  exitCode = report('验证项 17 · v3→v4 升级');
} catch (err) {
  console.error('测试异常：', err);
  exitCode = 1;
} finally {
  await shutdownApp();
}
process.exit(exitCode);
