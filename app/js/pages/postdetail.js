// 记录详情（二级界面）：精确到秒的时间 + 盖楼评论 + 自己点赞
// 评论内嵌在 posts[].comments：{ id, text, createdAt }，按 createdAt 正序即"楼层"
import * as store from '../store.js';
import { $, esc, uid, relativeCN, fullStampCN } from '../util.js';
import { confirmBox, toast } from '../ui.js';
import { previewImage, imageUrl } from '../image.js';
import { likeCount } from './post.js';

let curId = null;

function getPost() {
  return store.state.posts.find((p) => p.id === curId) || null;
}

/** 以库里最新那条为基准打补丁，避免把并发写入覆盖掉 */
async function patchPost(partial) {
  const base = store.state.posts.find((p) => p.id === curId);
  if (!base) return null;
  const next = await store.saveRecord('posts', { ...base, ...partial });
  return next;
}

export async function render(root, ctx = {}) {
  curId = ctx.params?.id || curId;
  const p = getPost();

  if (!p) {
    const box = document.createElement('div');
    box.className = 'postdetail-body';
    box.innerHTML = `<div class="empty">这条记录不在了<div class="small" style="margin-top:6px">
      可能已经被删掉了</div></div>`;
    root.replaceChildren(box);
    return;
  }

  const imgs = (p.images || []).filter((id) => imageUrl(id));
  const comments = [...(p.comments || [])].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
  const liked = !!p.liked;
  const created = p.createdAt ?? Date.now();

  const box = document.createElement('div');
  box.className = 'postdetail-body';
  box.innerHTML = `
    <article class="pd-main">
      <div class="pd-text">${esc(p.text)}</div>
      ${imgs.length ? `<div class="pd-imgs">${imgs.map((id) =>
        `<img src="${imageUrl(id)}" alt="配图" data-img="${esc(id)}" />`).join('')}</div>` : ''}
      <div class="pd-time">
        <div class="pd-stamp">${esc(fullStampCN(created))}</div>
        <div class="pd-rel">${esc(relativeCN(created))}</div>
      </div>
      <button class="like-btn big${liked ? ' on' : ''}" id="pdLike" aria-label="点赞">
        <svg class="ico"><use href="#i-heart"/></svg><span class="like-n">${likeCount(p)}</span>
      </button>
    </article>

    <div class="sec-title">评论 · ${comments.length} 条</div>
    <div class="cmt-list" id="cmtList">
      ${comments.length ? comments.map((c, i) => `
        <div class="cmt-item" data-cmt="${esc(c.id)}">
          <div class="cmt-head">
            <span class="cmt-floor">${i + 1} 楼</span>
            <span class="cmt-stamp">${esc(fullStampCN(c.createdAt ?? Date.now()))}</span>
            <button class="cmt-del" data-cmt-del="${esc(c.id)}" aria-label="删除这条评论">×</button>
          </div>
          <div class="cmt-text">${esc(c.text)}</div>
        </div>`).join('') : '<div class="muted small" style="padding:10px 2px">还没有评论，来说点什么</div>'}
    </div>

    <div class="cmt-compose">
      <textarea class="textarea" id="cmtInput" rows="2" placeholder="说点什么…（盖楼）"></textarea>
      <button class="btn solid" id="cmtSave">评论</button>
    </div>
  `;
  root.replaceChildren(box);
  bind(box, root);
}

function bind(box, root) {
  const input = $('#cmtInput', box);

  // 盖楼：追加一条评论，不动记录其它字段
  const addComment = async () => {
    const text = input.value.trim();
    if (!text) { input.focus(); toast('先写点什么吧'); return; }
    const p = getPost();
    if (!p) return;
    const comments = [...(p.comments || []), { id: uid(), text, createdAt: Date.now() }];
    await patchPost({ comments });
    await render(root, { params: { id: curId } });
    document.querySelector('#cmtInput')?.focus();
  };
  $('#cmtSave', box)?.addEventListener('click', addComment);
  input?.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); addComment(); }
  });

  box.addEventListener('click', async (ev) => {
    // 看大图
    const img = ev.target.closest('[data-img]');
    if (img) { previewImage(img.dataset.img); return; }

    // 自己点赞：点一下 +1，再点取消
    if (ev.target.closest('#pdLike')) {
      const p = getPost();
      if (!p) return;
      const next = await patchPost({ liked: !p.liked });
      if (!next) return;
      const btn = $('#pdLike', box);
      btn.classList.toggle('on', next.liked);
      const n = btn.querySelector('.like-n');
      if (n) n.textContent = String(likeCount(next));
      return;
    }

    // 删一条评论（弹确认，评论是盖上去的，误删可惜）
    const del = ev.target.closest('[data-cmt-del]');
    if (del) {
      const p = getPost();
      if (!p) return;
      const id = del.dataset.cmtDel;
      const target = (p.comments || []).find((c) => c.id === id);
      const yes = await confirmBox({
        title: '删掉这条评论？',
        desc: esc(target?.text || ''),
        okText: '删除',
        danger: true,
      });
      if (!yes) return;
      await patchPost({ comments: (p.comments || []).filter((c) => c.id !== id) });
      toast('评论已删除');
      await render(root, { params: { id: curId } });
    }
  });
}

export function title() { return '记录详情'; }
export function subtitle() { return ''; }
