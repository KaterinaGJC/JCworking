// 快速备忘：打开即记、双列便签墙、颜色、置顶、搜索、左滑删除、转成今日计划
import * as store from '../store.js';
import { $, $$, esc, uid, relativeCN, todayStr } from '../util.js';
import { sheet, confirmBox, toast, emptyState } from '../ui.js';
import { tipHtml } from '../tips.js';

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
  return `<div class="note ${esc(n.color || 'y')}" data-note="${n.id}">
    <div class="nt">${esc(n.content)}</div>
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

  // 点便签 → 菜单
  box.addEventListener('click', async (ev) => {
    if (Date.now() < suppressClickUntil) return;
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
        await store.saveRecord('notes', { ...rec, ...draft, content });
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
  let target = null;
  let moved = false;

  box.addEventListener('pointerdown', (ev) => {
    const note = ev.target.closest('[data-note]');
    if (!note) return;
    target = note;
    startX = ev.clientX;
    startY = ev.clientY;
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
    const note = target;
    target = null;
    note.style.transition = 'transform .18s ease, opacity .18s ease';
    if (moved && dx < -90) {
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

export function title() { return '快速备忘'; }
export function subtitle() { return ''; }
