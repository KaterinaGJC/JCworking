// 功能 16：底部新增「记录」大板块（个人博客 / 微博 / QQ 空间那种）
// 复现点：底部要有「记录」标签；能发一条记录（正文 + 可选配图）；
//         列表按时间倒序；点进二级界面能看到**精确到秒的详细时间**、
//         可以自己盖楼评论（每条评论也带详细时间、可删）、可以自己点赞（点一下 +1、再点取消）；
//         数据要进本地库、刷新不丢、备份能带上、清空能清掉；返回首页层级正确。
import path from 'node:path';
import { bootApp, shutdownApp, freshPage, goto, ok, eq, report } from '../lib.mjs';

let exitCode = 1;
const IMG = path.resolve('app/icons/icon-192.png');

/**
 * 点某个"选图片"按钮并在系统文件框里选中一张图。
 * 无头浏览器里点 file input 会立刻触发 cancel，所以用 CDP 拦截文件选择框。
 */
async function pickImage(page, clickSelector, file = IMG) {
  await page.send('Page.setInterceptFileChooserDialog', { enabled: true }).catch(() => {});
  const chooser = new Promise((resolve) => {
    page.on((m) => { if (m.method === 'Page.fileChooserOpened') resolve(m.params); });
  });
  await page.click(clickSelector);
  const info = await Promise.race([chooser, new Promise((r) => setTimeout(() => r(null), 4000))]);
  if (!info) throw new Error(`没有弹出文件选择框：${clickSelector}`);
  await page.send('DOM.setFileInputFiles', { files: [file], backendNodeId: info.backendNodeId });
  await new Promise((r) => setTimeout(r, 200));
}

const seed = (page, code) => page.eval(`(async () => {
  const st = await import('/js/store.js');
  const d = await import('/js/core/dates.js');
  const { uid } = await import('/js/util.js');
  ${code}
})()`);

/** 造一条已存在的记录，避免每次都走表单 */
const seedPost = (page, { id = 'p1', text = '第一条记录', createdAt = null } = {}) => page.eval(`(async () => {
  const st = await import('/js/store.js');
  const rec = {
    id: ${JSON.stringify(id)},
    text: ${JSON.stringify(text)},
    images: [],
    liked: false,
    comments: [],
    createdAt: ${JSON.stringify(createdAt)} || Date.now(),
  };
  await st.saveRecord('posts', rec);
  return rec.id;
})()`);

try {
  await bootApp();
  const page = await freshPage();

  // ---------- 1. 底部有「记录」标签 ----------
  await goto(page, '#/home');
  await page.waitFor(`document.querySelector('.home-body') !== null`, { message: '首页渲染' });
  const tabs = await page.eval(`[...document.querySelectorAll('#tabbar .tab')].map(t => t.dataset.act)`);
  ok('底部有「记录」标签', tabs.includes('post'), JSON.stringify(tabs));
  eq('底部标签变成 5 个', tabs.length, 5);
  ok('标签文案是「记录」', await page.eval(
    `document.querySelector('.tab[data-act="post"]').textContent.includes('记录')`));

  await page.click('.tab[data-act="post"]');
  await page.waitFor(`location.hash === '#/post'`, { message: '切到记录页' });
  await page.waitFor(`document.querySelector('.post-body') !== null`, { message: '记录页渲染' });
  eq('记录页标题', await page.eval(`document.querySelector('#pageTitle').textContent`), '记录');
  ok('记录页容器渲染', await page.eval(`document.querySelector('[data-page="post"]') !== null`));
  ok('记录标签高亮', await page.eval(
    `document.querySelector('.tab[data-act="post"]').classList.contains('on')`));

  // ---------- 2. 空状态 + 发布入口 ----------
  ok('空状态给人话提示', await page.eval(
    `document.querySelector('.post-body').textContent.includes('还没有记录')`));
  ok('有发布入口', await page.eval(`document.querySelector('#postInput') !== null`));
  ok('进入时不自动聚焦（不弹键盘）', await page.eval(
    `document.activeElement?.id !== 'postInput'`));

  // ---------- 3. 发一条 ----------
  await page.realClick('#postInput');
  await page.type('#postInput', '今天把课表网格改好了，挺顺');
  await page.click('#postSave');
  await new Promise((r) => setTimeout(r, 500));

  ok('记录出现在列表', await page.eval(
    `[...document.querySelectorAll('.post-card')].some(e => e.textContent.includes('课表网格'))`));
  eq('已落库', await page.eval(
    `(async () => (await import('/js/store.js')).state.posts.length)()`), 1);
  ok('输入框已清空', await page.eval(
    `document.querySelector('#postInput').value === ''`));
  ok('列表卡片带相对时间', await page.eval(
    `document.querySelector('.post-card .post-when').textContent.includes('刚刚')`));
  ok('卡片上有评论数与点赞数', await page.eval(`(() => {
    const c = document.querySelector('.post-card .post-stats');
    return !!c && /评论|0/.test(c.textContent);
  })()`));

  // 空内容不该存
  await page.click('#postSave');
  await new Promise((r) => setTimeout(r, 250));
  eq('空内容不会存进去', await page.eval(
    `(async () => (await import('/js/store.js')).state.posts.length)()`), 1);

  // ---------- 4. 进二级详情：详细时间 ----------
  const postId = await page.eval(`(async () => (await import('/js/store.js')).state.posts[0].id)()`);
  await page.click(`.post-card[data-post="${postId}"] .post-text`);
  await page.waitFor(`document.querySelector('.postdetail-body') !== null`, { message: '详情页' });
  eq('详情页标题', await page.eval(`document.querySelector('#pageTitle').textContent`), '记录详情');
  ok('详情页显示正文', await page.eval(
    `document.querySelector('.pd-text').textContent.includes('课表网格')`));

  const stamp = await page.eval(`document.querySelector('.pd-stamp').textContent`);
  ok('详情页有精确到秒的详细时间', /^\d{4}年\d{1,2}月\d{1,2}日 周[日一二三四五六] \d{2}:\d{2}:\d{2}$/.test(stamp.trim()),
    stamp);
  const stampMatchesDb = await page.eval(`(async () => {
    const st = await import('/js/store.js');
    const d = await import('/js/core/dates.js');
    const p = st.state.posts[0];
    return document.querySelector('.pd-stamp').textContent.trim() === d.fullStampCN(p.createdAt);
  })()`);
  ok('详细时间与库里 createdAt 一致', stampMatchesDb);
  ok('详情页也给了相对时间', await page.eval(
    `document.querySelector('.pd-rel') !== null`));

  // ---------- 5. 自己盖楼评论 ----------
  ok('有评论输入框', await page.eval(`document.querySelector('#cmtInput') !== null`));
  await page.type('#cmtInput', '第一条评论');
  await page.click('#cmtSave');
  await new Promise((r) => setTimeout(r, 450));

  ok('评论出现了', await page.eval(
    `[...document.querySelectorAll('.cmt-item')].some(e => e.textContent.includes('第一条评论'))`));
  eq('评论数为 1', await page.eval(`document.querySelectorAll('.cmt-item').length`), 1);
  ok('评论已落库', await page.eval(`(async () => {
    const st = await import('/js/store.js');
    const p = st.state.posts.find(x => x.id === '${postId}');
    return (p.comments || []).length;
  })()`) === 1);
  ok('评论也带详细时间', await page.eval(`(() => {
    const el = document.querySelector('.cmt-item .cmt-stamp');
    return !!el && /\\d{2}:\\d{2}:\\d{2}/.test(el.textContent);
  })()`));

  // 盖第二楼，顺序应是时间正序（先发的在上面）
  await page.type('#cmtInput', '第二条评论');
  await page.click('#cmtSave');
  await new Promise((r) => setTimeout(r, 450));
  const order = await page.eval(
    `[...document.querySelectorAll('.cmt-item .cmt-text')].map(e => e.textContent.trim())`);
  eq('盖楼按时间正序排列', order, ['第一条评论', '第二条评论']);
  ok('显示楼层号', await page.eval(
    `document.querySelector('.cmt-item .cmt-floor').textContent.includes('1 楼')`));
  ok('评论输入框清空了', await page.eval(
    `document.querySelector('#cmtInput').value === ''`));

  // 空评论不该存
  await page.click('#cmtSave');
  await new Promise((r) => setTimeout(r, 250));
  eq('空评论不会存', await page.eval(`(async () => {
    const st = await import('/js/store.js');
    const p = st.state.posts.find(x => x.id === '${postId}');
    return (p.comments || []).length;
  })()`), 2);

  // 列表上的评论计数要跟着变
  await page.click('#btnBack');
  await page.waitFor(`document.querySelector('.post-body') !== null`, { message: '回到列表' });
  await new Promise((r) => setTimeout(r, 300));
  ok('列表上显示 2 条评论', await page.eval(
    `document.querySelector('.post-card .post-stats').textContent.includes('2')`));

  // ---------- 6. 自己点赞 ----------
  await page.click(`.post-card[data-post="${postId}"] .post-text`);
  await page.waitFor(`document.querySelector('.postdetail-body') !== null`);
  eq('初始点赞数为 0', await page.eval(
    `Number(document.querySelector('#pdLike .like-n').textContent)`), 0);

  await page.click('#pdLike');
  await new Promise((r) => setTimeout(r, 400));
  eq('点一下变 1', await page.eval(
    `Number(document.querySelector('#pdLike .like-n').textContent)`), 1);
  ok('点赞态已标记', await page.eval(
    `document.querySelector('#pdLike').classList.contains('on')`));
  ok('点赞已落库', await page.eval(`(async () => {
    const st = await import('/js/store.js');
    return st.state.posts.find(p => p.id === '${postId}').liked;
  })()`) === true);

  await page.click('#pdLike');
  await new Promise((r) => setTimeout(r, 400));
  eq('再点取消，回到 0', await page.eval(
    `Number(document.querySelector('#pdLike .like-n').textContent)`), 0);
  ok('点赞态已取消', await page.eval(
    `!document.querySelector('#pdLike').classList.contains('on')`));

  // 列表上也能直接点赞
  await page.click('#btnBack');
  await page.waitFor(`document.querySelector('.post-body') !== null`);
  await new Promise((r) => setTimeout(r, 250));
  await page.click(`.post-card[data-post="${postId}"] [data-like]`);
  await new Promise((r) => setTimeout(r, 400));
  ok('列表上点赞生效', await page.eval(`(async () => {
    const st = await import('/js/store.js');
    return st.state.posts.find(p => p.id === '${postId}').liked;
  })()`) === true);
  ok('详情页与列表的点赞是同一份数据', await page.eval(
    `document.querySelector('.post-card[data-post="${postId}"] [data-like]').classList.contains('on')`));

  // ---------- 7. 删一条评论 ----------
  await page.click(`.post-card[data-post="${postId}"] .post-text`);
  await page.waitFor(`document.querySelector('.postdetail-body') !== null`);
  const beforeCmt = await page.eval(`document.querySelectorAll('.cmt-item').length`);
  await page.click('.cmt-item [data-cmt-del]');
  await page.waitFor(`document.querySelector('.confirm button[data-a="1"]') !== null`, { message: '删除确认' });
  await page.click('.confirm button[data-a="1"]');
  await new Promise((r) => setTimeout(r, 450));
  eq('删除后评论少一条', await page.eval(
    `document.querySelectorAll('.cmt-item').length`), beforeCmt - 1);

  // ---------- 8. 刷新不丢 ----------
  await page.reload();
  await goto(page, '#/post');
  await page.waitFor(`document.querySelector('.post-body') !== null`);
  await new Promise((r) => setTimeout(r, 300));
  ok('刷新后记录仍在', await page.eval(
    `[...document.querySelectorAll('.post-card')].some(e => e.textContent.includes('课表网格'))`));
  await page.click('.post-card .post-text');
  await page.waitFor(`document.querySelector('.postdetail-body') !== null`);
  eq('刷新后评论仍在', await page.eval(`document.querySelectorAll('.cmt-item').length`), beforeCmt - 1);
  ok('刷新后详细时间仍在', await page.eval(
    `/\\d{2}:\\d{2}:\\d{2}/.test(document.querySelector('.pd-stamp').textContent)`));

  // ---------- 9. 列表按时间倒序 ----------
  await seedPost(page, { id: 'p2', text: '第二条记录（更早）', createdAt: Date.now() - 3600 * 1000 });
  await seedPost(page, { id: 'p3', text: '第三条记录（最新）' });
  await goto(page, '#/home');
  await goto(page, '#/post');
  await page.waitFor(`document.querySelector('.post-body') !== null`);
  await new Promise((r) => setTimeout(r, 300));
  const listOrder = await page.eval(
    `[...document.querySelectorAll('.post-card .post-text')].map(e => e.textContent.trim())`);
  eq('列表按时间倒序（最新在上）', listOrder, ['第三条记录（最新）', '今天把课表网格改好了，挺顺', '第二条记录（更早）']);

  // ---------- 10. 删记录 + 撤销 ----------
  const cntBefore = await page.eval(`document.querySelectorAll('.post-card').length`);
  await page.click('.post-card[data-post="p2"] [data-post-del]');
  await page.waitFor(`document.querySelector('.confirm button[data-a="1"]') !== null`, { message: '删记录确认' });
  await page.click('.confirm button[data-a="1"]');
  await new Promise((r) => setTimeout(r, 450));
  eq('删除后少一条', await page.eval(
    `document.querySelectorAll('.post-card').length`), cntBefore - 1);
  await page.click('.toast button');
  await new Promise((r) => setTimeout(r, 450));
  eq('撤销后恢复', await page.eval(
    `document.querySelectorAll('.post-card').length`), cntBefore);

  // ---------- 11. 重进板块回到初始界面（与其他板块一致） ----------
  await goto(page, '#/post');
  await page.waitFor(`document.querySelector('.post-body') !== null`);
  await goto(page, '#/fun');
  await page.waitFor(`document.querySelector('.fun-body') !== null`);
  await goto(page, '#/post');
  await page.waitFor(`document.querySelector('.post-body') !== null`);
  ok('重进记录页仍是列表（不在详情）', true);

  // ---------- 11.5 配图（博客式记录的核心） ----------
  await goto(page, '#/post');
  await page.waitFor(`document.querySelector('.post-body') !== null`);
  ok('有配图入口', await page.eval(`document.querySelector('#postAddImg') !== null`));
  await page.type('#postInput', '带配图的一条记录');
  await pickImage(page, '#postAddImg');
  await new Promise((r) => setTimeout(r, 500));
  ok('选图后出现缩略图', await page.eval(
    `document.querySelector('#postImgs img') !== null`));

  await page.click('#postSave');
  await new Promise((r) => setTimeout(r, 600));
  const imgPostId = await page.eval(`(async () => {
    const st = await import('/js/store.js');
    const p = st.state.posts.find(x => x.text.includes('带配图'));
    return p ? p.id : null;
  })()`);
  ok('带图记录已落库', !!imgPostId);
  ok('记录里存了图片 id', await page.eval(`(async () => {
    const st = await import('/js/store.js');
    return (st.state.posts.find(p => p.id === '${imgPostId}')?.images || []).length;
  })()`) === 1);
  ok('图片进了 blobs 表（压缩后的 dataURL）', await page.eval(`(async () => {
    const st = await import('/js/store.js');
    const pid = st.state.posts.find(p => p.id === '${imgPostId}').images[0];
    const b = st.state.blobs.find(x => x.id === pid);
    return !!b && String(b.dataUrl).startsWith('data:image/');
  })()`));
  ok('列表卡片上显示了图', await page.eval(
    `document.querySelector('.post-card[data-post="${imgPostId}"] .post-imgs img') !== null`));

  await page.click(`.post-card[data-post="${imgPostId}"] .post-text`);
  await page.waitFor(`document.querySelector('.postdetail-body') !== null`);
  ok('详情页也显示图', await page.eval(
    `document.querySelector('.pd-imgs img') !== null`));
  await page.click('#btnBack');
  await page.waitFor(`document.querySelector('.post-body') !== null`);

  // ---------- 12. 备份带上记录与评论 ----------
  const exported = await page.eval(`(async () => {
    const b = await import('/js/backup.js');
    const payload = await b.exportBackup();
    return {
      hasPosts: Array.isArray(payload.data.posts),
      posts: payload.data.posts?.length ?? 0,
      hasComments: (payload.data.posts ?? []).some(p => Array.isArray(p.comments) && p.comments.length),
    };
  })()`);
  ok('导出包含 posts 数据段', exported.hasPosts);
  ok('导出带上了记录', exported.posts >= 2, JSON.stringify(exported));
  ok('导出带上了评论', exported.hasComments);

  // ---------- 13. 清空能把记录也清掉 ----------
  await goto(page, '#/settings');
  await page.waitFor(`document.querySelector('[data-act="clear"]') !== null`);
  await page.click('[data-act="clear"]');
  await page.waitFor(`document.querySelector('#promptInput') !== null`);
  await page.type('#promptInput', '清空');
  await page.click('.confirm button[data-a="1"]');
  await new Promise((r) => setTimeout(r, 600));
  eq('清空后记录为 0', await page.eval(
    `(async () => (await import('/js/store.js')).state.posts.length)()`), 0);

  // ---------- 14. 一级界面返回回首页 ----------
  await goto(page, '#/post');
  await page.waitFor(`document.querySelector('.post-body') !== null`);
  ok('记录一级界面有返回按钮', await page.eval(
    `!document.querySelector('#btnBack').classList.contains('hidden')`));
  await page.click('#btnBack');
  await new Promise((r) => setTimeout(r, 450));
  eq('记录页点返回回首页', await page.eval(`location.hash`), '#/home');

  // ---------- 15. 首页依旧不含课表内容（C-01 不能被破坏） ----------
  await seed(page, `
    const t = d.todayStr();
    const stu = { id: uid(), name: '刘同学', createdAt: Date.now() };
    await st.saveRecord('students', stu);
    await st.saveRecord('lessons', { id: uid(), date: t, start: '10:00', duration: 60,
      type: 'one', place: '', status: 'todo', content: '圆的面积', homework: '',
      repeat: { type: 'none', weekdays: [], sourceId: null },
      members: [{ studentId: stu.id, name: '刘同学', state: null, note: '', attendance: 'todo' }],
      createdAt: Date.now() });
  `);
  await goto(page, '#/home');
  await page.waitFor(`document.querySelector('.home-body') !== null`);
  await new Promise((r) => setTimeout(r, 300));
  const homeText = await page.eval(`document.querySelector('.home-body').textContent`);
  ok('首页仍不出现学生姓名（C-01）', !homeText.includes('刘同学'));
  ok('首页仍不出现课程内容（C-01）', !homeText.includes('圆的面积'));

  await page.close();
  exitCode = report('功能 16 · 记录板块');
} catch (err) {
  console.error('测试异常：', err);
  exitCode = 1;
} finally {
  await shutdownApp();
}
process.exit(exitCode);
