// 记录：博客式时间线（发记录、配图、点赞、进详情盖楼评论）
// 数据：posts[] { id, text, images[], liked, comments[], createdAt }
//      评论内嵌在记录里（跟 lessons.members[] 一个套路），备份/合并/清空自动覆盖
import * as store from '../store.js';
import { $, esc, uid, relativeCN } from '../util.js';
import { confirmBox, toast, emptyState } from '../ui.js';
import { tipHtml } from '../tips.js';
import { addImageFromPicker, removeImage, previewImage, imageUrl } from '../image.js';

/** 正在编辑但还没发布的配图（发布后清空） */
let draftImgs = [];

export function sortedPosts() {
  return [...store.state.posts].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

export function likeCount(p) {
  return p?.liked ? 1 : 0;
}

function draftImgsHtml() {
  return draftImgs.filter((id) => imageUrl(id)).map((id) => `
    <div class="img-thumb-wrap">
      <img class="img-thumb" src="${imageUrl(id)}" alt="配图" data-draft-preview="${esc(id)}" />
      <button class="img-del" data-draft-del="${esc(id)}" aria-label="去掉这张图">×</button>
    </div>`).join('');
}

function cardHtml(p) {
  const imgs = (p.images || []).filter((id) => imageUrl(id));
  const cmts = (p.comments || []).length;
  const liked = !!p.liked;
  return `<article class="post-card" data-post="${esc(p.id)}">
    <div class="post-text" data-open="${esc(p.id)}" role="button" tabindex="0">${esc(p.text)}</div>
    ${imgs.length ? `<div class="post-imgs">${imgs.map((id) =>
      `<img src="${imageUrl(id)}" alt="配图" data-img="${esc(id)}" />`).join('')}</div>` : ''}
    <div class="post-foot">
      <span class="post-when">${esc(relativeCN(p.createdAt ?? Date.now()))}</span>
      <span class="post-stats">${cmts} 条评论</span>
      <button class="like-btn${liked ? ' on' : ''}" data-like="${esc(p.id)}" aria-label="点赞">
        <svg class="ico"><use href="#i-heart"/></svg><span class="like-n">${likeCount(p)}</span>
      </button>
      <button class="post-del" data-post-del="${esc(p.id)}" aria-label="删除这条记录">删除</button>
    </div>
  </article>`;
}

export async function render(root) {
  const posts = sortedPosts();

  const box = document.createElement('div');
  box.className = 'post-body';
  box.innerHTML = `
    ${await tipHtml('post')}
    <div class="post-compose">
      <textarea class="textarea" id="postInput" rows="2"
        placeholder="此刻在想什么？写下来，可以配图"></textarea>
      <div class="post-draft-imgs" id="postImgs">${draftImgsHtml()}</div>
      <div class="compose-actions">
        <button class="btn" id="postAddImg">
          <svg class="ico" style="width:15px;height:15px"><use href="#i-img"/></svg>配图</button>
        <button class="btn solid" id="postSave">发布</button>
      </div>
    </div>

    <div id="postList">
      ${posts.length ? posts.map(cardHtml).join('') : emptyState({
        text: '还没有记录',
        extra: '<div class="small" style="margin-top:6px">像发微博一样，把此刻写下来</div>',
      })}
    </div>
  `;
  root.replaceChildren(box);
  bind(box, root);
}

function bind(box, root) {
  const input = $('#postInput', box);

  // 发布：正文必填，配图可选；不自动聚焦，避免一进板块就弹键盘
  const publish = async () => {
    const text = input.value.trim();
    if (!text) { input.focus(); toast('先写点什么吧'); return; }
    await store.saveRecord('posts', {
      id: uid(),
      text,
      images: [...draftImgs],
      liked: false,
      comments: [],
      createdAt: Date.now(),
    });
    draftImgs = [];
    input.value = '';
    toast('发出去了');
    await render(root);
  };
  $('#postSave', box)?.addEventListener('click', publish);
  input?.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); publish(); }
  });

  // 配图：压缩后存本地 blobs，先挂在草稿上，发布时一起写入
  $('#postAddImg', box)?.addEventListener('click', async () => {
    const id = await addImageFromPicker();
    if (!id) return;
    draftImgs.push(id);
    const wrap = $('#postImgs', box);
    if (wrap) wrap.innerHTML = draftImgsHtml();
  });

  box.addEventListener('click', async (ev) => {
    // 草稿缩略图：看大图 / 去掉
    const dp = ev.target.closest('[data-draft-preview]');
    if (dp) { previewImage(dp.dataset.draftPreview); return; }
    const dd = ev.target.closest('[data-draft-del]');
    if (dd) {
      const id = dd.dataset.draftDel;
      draftImgs = draftImgs.filter((x) => x !== id);
      await removeImage(id);
      const wrap = $('#postImgs', box);
      if (wrap) wrap.innerHTML = draftImgsHtml();
      return;
    }

    // 已发布记录里的配图：点开看大图（别顺带跳详情）
    const img = ev.target.closest('[data-img]');
    if (img) { ev.stopPropagation(); previewImage(img.dataset.img); return; }

    // 列表上直接点赞：只改这一条，不整页重绘（避免打断正在输入的正文）
    const like = ev.target.closest('[data-like]');
    if (like) {
      ev.stopPropagation();
      const p = store.state.posts.find((x) => x.id === like.dataset.like);
      if (!p) return;
      const next = { ...p, liked: !p.liked };
      await store.saveRecord('posts', next);
      like.classList.toggle('on', next.liked);
      const n = like.querySelector('.like-n');
      if (n) n.textContent = String(likeCount(next));
      return;
    }

    // 删除整条记录：弹确认 + 5 秒撤销
    const del = ev.target.closest('[data-post-del]');
    if (del) {
      ev.stopPropagation();
      const p = store.state.posts.find((x) => x.id === del.dataset.postDel);
      if (!p) return;
      const yes = await confirmBox({
        title: '删掉这条记录？',
        desc: '连同它的评论一起删掉',
        okText: '删除',
        danger: true,
      });
      if (!yes) return;
      await store.removeRecord('posts', p.id);
      await render(root);
      toast('已删除', {
        actionLabel: '撤销',
        onAction: async () => {
          await store.saveRecord('posts', p);
          await render(root);
        },
      });
      return;
    }

    // 进二级详情（盖楼评论 / 点赞 / 详细时间都在里面）
    const open = ev.target.closest('[data-open]');
    if (open) { location.hash = `#/postdetail?id=${encodeURIComponent(open.dataset.open)}`; }
  });
}

/** 重进板块回到初始界面：清掉没发出去的草稿配图 */
export function reset() {
  draftImgs = [];
}

export function title() { return '记录'; }
export function subtitle() { return ''; }
