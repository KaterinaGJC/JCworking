// 快速备忘：打开即记、双列便签墙、颜色、置顶、搜索、左滑删除、转成今日计划
import * as store from '../store.js';
import { $, $$, esc, uid, relativeCN, todayStr } from '../util.js';
import { sheet, confirmBox, toast, emptyState } from '../ui.js';
import { tipHtml } from '../tips.js';
import { addImageFromPicker, removeImage, previewImage, imageUrl } from '../image.js';

/** 便签菜单里的图片缩略图（可删） */
function imagesHtml(ids) {
  return (ids || []).filter((id) => imageUrl(id)).map((id) => `
    <div class="img-thumb-wrap">
      <img class="img-thumb" src="${imageUrl(id)}" alt="图片" data-preview="${esc(id)}" />
      <button class="img-del" data-del="${esc(id)}" aria-label="删除这张图">×</button>
    </div>`).join('');
}

let searchOn = false;
let keyword = '';
// v2：颜色从 4 种扩到 8 种（y 黄 / o 橙 / g 绿 / c 青 / b 蓝 / v 紫 / p 粉 / n 灰）
const COLORS = [
  ['y', '黄'], ['o', '橙'], ['g', '绿'], ['c', '青'],
  ['b', '蓝'], ['v', '紫'], ['p', '粉'], ['n', '灰'],
];
let suppressClickUntil = 0;

function sortedNotes() {
  return [...store.state.notes].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    return (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0);
  });
}

function visibleNotes() {
  const all = sortedNotes();
  if (!keyword.trim()) return all;
  const k = keyword.trim().toLowerCase();
  return all.filter((n) => (n.content || '').toLowerCase().includes(k));
}

function noteHtml(n) {
  const imgs = (n.images || []).filter((id) => imageUrl(id));
  return `<div class="note ${esc(n.color || 'y')}" data-note="${n.id}">
    <div class="nt">${esc(n.content)}</div>
    ${imgs.length ? `<div class="note-imgs">${imgs.map((id) =>
      `<img src="${imageUrl(id)}" alt="图片" data-img="${esc(id)}" />`).join('')}</div>` : ''}
    <div class="nw">${n.pinned ? '<span class="pinmark"></span>' : ''}${
      n.pinned ? '置顶 · ' : ''}${esc(relativeCN(n.updatedAt ?? n.createdAt ?? Date.now()))}</div>
  </div>`;
}

export async function render(root) {
  const notes = visibleNotes();

  const box = document.createElement('div');
  box.className = 'memo-body';

  const searchBar = searchOn
    ? `<div class="quick-add" style="margin-bottom:12px">
         <svg class="ico" style="width:18px;height:18px;color:var(--text3)"><use href="#i-search"/></svg>
         <input id="memoSearch" placeholder="搜一搜…" value="${esc(keyword)}" />
       </div>`
    : '';

  box.innerHTML = `
    ${searchBar}
    ${await tipHtml('memo')}
    <div class="memo-entry">
      <textarea class="textarea" id="memoInput" placeholder="写点什么…记完就走，不用管格式"></textarea>
      <button class="savebtn" id="memoSave">存</button>
    </div>
    <div id="memoList">
      ${notes.length ? `<div class="masonry">${notes.map(noteHtml).join('')}</div>`
        : emptyState({
          text: keyword ? `没有找到包含「${esc(keyword)}」的便签` : '还没有便签',
          extra: keyword ? '' : '<div class="small" style="margin-top:6px">想到什么就写一行，以后再翻也行</div>',
        })}
    </div>
  `;
  root.replaceChildren(box);
  bind(box, root);

  // 进入备忘页不再自动聚焦（避免一进来就弹键盘），点输入框才进入输入状态
  const input = $('#memoInput', box);
  if (input) {
    const fit = () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 200) + 'px'; };
    input.addEventListener('input', fit);
    requestAnimationFrame(fit);
  }
  if (searchOn) {
    const s = $('#memoSearch', box);
    s?.focus();
  }
}

function bind(box, root) {
  const input = $('#memoInput', box);
  const saveBtn = $('#memoSave', box);

  const save = async () => {
    const content = input.value.trim();
    if (!content) { input.focus(); return; }
    await store.saveRecord('notes', {
      id: uid(),
      content,
      color: 'y',
      pinned: false,
      createdAt: Date.now(),
    });
    input.value = '';
    input.style.height = 'auto';
    await render(root);
    // 重渲染后旧的 input 已经不在文档里，重新聚焦新的那一个，方便连着记几条
    document.querySelector('#memoInput')?.focus();
  };

  saveBtn?.addEventListener('click', save);
  input?.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); save(); }
  });

  // 搜索
  $('#btnSearch').onclick = async () => {
    searchOn = !searchOn;
    if (!searchOn) keyword = '';
    await render(root);
  };

  box.addEventListener('input', (ev) => {
    if (ev.target.id === 'memoSearch') {
      keyword = ev.target.value;
      const host = $('#memoList', box);
      const notes = visibleNotes();
      if (!host) return;
      host.innerHTML = notes.length
        ? `<div class="masonry">${notes.map(noteHtml).join('')}</div>`
        : emptyState({ text: `没有找到包含「${esc(keyword)}」的便签` });
    }
  });

  // 点便签里的图片 → 看大图（不打开菜单）
  box.addEventListener('click', (ev) => {
    const img = ev.target.closest('[data-img]');
    if (!img) return;
    ev.stopPropagation();
    previewImage(img.dataset.img);
  }, true);

  // 点便签 → 菜单
  box.addEventListener('click', async (ev) => {
    if (Date.now() < suppressClickUntil) return;
    if (ev.target.closest('[data-img]')) return;
    const note = ev.target.closest('[data-note]');
    if (!note) return;
    const rec = store.state.notes.find((n) => n.id === note.dataset.note);
    if (rec) openMenu(root, rec);
  });

  enableSwipe(box, root);
}

function openMenu(root, rec) {
  const draft = { content: rec.content, color: rec.color || 'y', pinned: !!rec.pinned };
  let saveFn = () => {};

  sheet({
    title: '这条便签',
    body: `
      <textarea class="textarea" id="n-content" rows="4">${esc(draft.content)}</textarea>
      <div class="field" style="margin-top:12px">
        <label>颜色</label>
        <div class="colordots" id="n-colors">
          ${COLORS.map(([c]) => `<button class="colordot ${c}${draft.color === c ? ' on' : ''}" data-color="${c}" aria-label="${c}"></button>`).join('')}
        </div>
      </div>
      <div class="field">
        <label>图片</label>
        <div class="imgs" id="n-imgs">${imagesHtml(rec.images || [])}</div>
        <button class="btn" id="n-addimg" style="margin-top:8px">＋ 加图片</button>
      </div>
      <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
        <button class="btn" id="n-pin">${draft.pinned ? '取消置顶' : '置顶'}</button>
        <button class="btn" id="n-toPlan">设为今日计划</button>
        <button class="btn danger" id="n-del">删除</button>
      </div>
    `,
    actions: [
      { label: '取消', onClick: (close) => close() },
      { label: '保存', kind: 'blue', onClick: (close) => { close(); saveFn(); } },
    ],
    onMount: (el, close) => {
      const ta = $('#n-content', el);
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);

      $('#n-colors', el).addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-color]');
        if (!b) return;
        draft.color = b.dataset.color;
        el.querySelectorAll('.colordot').forEach((x) => x.classList.toggle('on', x === b));
      });

      $('#n-pin', el).addEventListener('click', () => {
        draft.pinned = !draft.pinned;
        $('#n-pin', el).textContent = draft.pinned ? '取消置顶' : '置顶';
      });

      // 加图片：立刻落库（不用等「保存」），避免误点取消丢图
      $('#n-addimg', el).addEventListener('click', async () => {
        try {
          const id = await addImageFromPicker();
          if (!id) return;
          const cur = store.state.notes.find((n) => n.id === rec.id) || rec;
          const images = [...(cur.images || []), id];
          await store.saveRecord('notes', { ...cur, images });
          $('#n-imgs', el).innerHTML = imagesHtml(images);
          toast('图片已加入');
        } catch (err) {
          toast(err?.message || '这张图片加不进来');
        }
      });

      $('#n-imgs', el).addEventListener('click', async (ev) => {
        const del = ev.target.closest('[data-del]');
        if (del) {
          const cur = store.state.notes.find((n) => n.id === rec.id) || rec;
          const images = (cur.images || []).filter((id) => id !== del.dataset.del);
          await store.saveRecord('notes', { ...cur, images });
          await removeImage(del.dataset.del);
          $('#n-imgs', el).innerHTML = imagesHtml(images);
          toast('图片已删除');
          return;
        }
        const thumb = ev.target.closest('[data-preview]');
        if (thumb) previewImage(thumb.dataset.preview);
      });

      $('#n-toPlan', el).addEventListener('click', async () => {
        const text = ta.value.trim();
        if (!text) { toast('先写内容'); return; }
        await store.saveRecord('tasks', {
          id: uid(),
          date: todayStr(),
          title: text.slice(0, 100),
          time: null,
          note: '',
          repeat: { type: 'none', weekdays: [], sourceId: null },
          done: false,
          doneAt: null,
          sort: 0,
          createdAt: Date.now(),
        });
        toast('已加到今日计划（便签保留）');
        close();
      });

      $('#n-del', el).addEventListener('click', async () => {
        close();
        await doDelete(root, rec);
      });

      saveFn = async () => {
        const content = ta.value.trim();
        if (!content) { toast('内容不能为空'); return; }
        // 以库里最新那份为基准，避免把菜单打开期间新加的图片覆盖掉
        const cur = store.state.notes.find((n) => n.id === rec.id) || rec;
        await store.saveRecord('notes', { ...cur, ...draft, content });
        await render(root);
      };
    },
  });
}

async function doDelete(root, rec) {
  await store.removeRecord('notes', rec.id);
  await render(root);
  toast('已删除', {
    actionLabel: '撤销',
    onAction: async () => {
      await store.saveRecord('notes', rec);
      await render(root);
    },
  });
}

/** 左滑删除 */
function enableSwipe(box, root) {
  let startX = 0;
  let startY = 0;
  let startTime = 0;
  let target = null;
  let moved = false;

  // 甩出去就算删：距离不够但速度够快也认（跟"甩卡片"的手感一致）
  const DISMISS_PX = 90;
  const DISMISS_VELOCITY = 0.11;   // px / ms，来自 Emil 的设计工程指南

  box.addEventListener('pointerdown', (ev) => {
    const note = ev.target.closest('[data-note]');
    if (!note) return;
    target = note;
    startX = ev.clientX;
    startY = ev.clientY;
    startTime = performance.now();
    moved = false;
    target.style.transition = 'none';
  });

  box.addEventListener('pointermove', (ev) => {
    if (!target) return;
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    if (!moved && Math.abs(dx) < 8) return;
    if (Math.abs(dy) > Math.abs(dx)) { // 竖向滚动，不拦
      target.style.transform = '';
      return;
    }
    moved = true;
    ev.preventDefault();
    target.style.transform = `translateX(${Math.min(0, dx)}px)`;
    target.style.opacity = String(Math.max(0.35, 1 + Math.min(0, dx) / 220));
  });

  box.addEventListener('pointerup', async (ev) => {
    if (!target) return;
    const dx = ev.clientX - startX;
    const elapsed = Math.max(1, performance.now() - startTime);
    const velocity = Math.abs(dx) / elapsed;
    const note = target;
    target = null;
    // 收起时的回弹比甩出更快（松手要跟手）
    note.style.transition = 'transform .18s var(--ease-out), opacity .18s var(--ease-out)';
    const flicked = moved && dx < 0 && velocity > DISMISS_VELOCITY;
    if (moved && (dx < -DISMISS_PX || flicked)) {
      const rec = store.state.notes.find((n) => n.id === note.dataset.note);
      suppressClickUntil = Date.now() + 400;
      if (rec) await doDelete(root, rec);
    } else {
      note.style.transform = '';
      note.style.opacity = '';
    }
  });

  box.addEventListener('pointercancel', () => {
    if (target) {
      target.style.transform = '';
      target.style.opacity = '';
      target = null;
    }
  });
}

export function reset() {
  searchOn = false;
  keyword = '';
}

export function title() { return '快速备忘'; }
export function subtitle() { return ''; }
