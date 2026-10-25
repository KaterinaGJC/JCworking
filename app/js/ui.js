// 通用 UI：底部面板 / 确认框 / 提示条 / 空状态
import { $, esc } from './util.js';

const overlay = () => document.getElementById('overlay');

export function closeAll() {
  const o = overlay();
  if (o) o.innerHTML = '';
}

/* ---------- 弹层与返回键 ----------
 * 弹层本身**不碰浏览历史**（历史里只留页面），
 * 手机上的返回键由 main.js 统一拦截：如果还有弹层，就关掉弹层并把地址恢复回去，
 * 相当于"这次返回被取消"。
 * 这样就不会出现「关面板的异步回退把新弹出来的确认框一起关掉」这类竞态。
 */
export function hasOverlay() {
  const o = overlay();
  return !!o && o.children.length > 0;
}

/** 只清 DOM */
export function closeTopOverlay() {
  const o = overlay();
  if (!o || !o.children.length) return false;
  o.innerHTML = '';
  return true;
}

/** 供 App 内返回按钮用（语义化别名） */
export function closeOverlayAndHistory() {
  return closeTopOverlay();
}

/** 底部弹出面板 */
export function sheet({ title = '', body = '', actions = [], onMount } = {}) {
  const o = overlay();
  const mask = document.createElement('div');
  mask.className = 'sheet-mask';
  const actsHtml = actions.length
    ? `<div class="row">${actions.map((a, i) =>
        `<button class="btn ${a.kind || ''}" data-i="${i}">${esc(a.label)}</button>`).join('')}</div>`
    : '';
  mask.innerHTML = `<div class="sheet">
    ${title ? `<h3>${esc(title)}</h3>` : ''}
    <div class="sheet-body">${body}</div>
    ${actsHtml}
  </div>`;
  o.innerHTML = '';
  o.appendChild(mask);

  const close = () => {
    if (!mask.parentNode) return;
    mask.remove();
  };
  mask.addEventListener('click', (ev) => {
    if (ev.target === mask) close();
  });
  mask.querySelectorAll('.row .btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const a = actions[Number(btn.dataset.i)];
      a?.onClick?.(close);
    });
  });
  onMount?.(mask.querySelector('.sheet'), close);
  return { el: mask.querySelector('.sheet'), close };
}

/** 确认框 → Promise<boolean> */
export function confirmBox({ title = '确认', desc = '', okText = '确定', cancelText = '取消', danger = false } = {}) {
  return new Promise((resolve) => {
    const o = overlay();
    const box = document.createElement('div');
    box.className = 'confirm';
    box.innerHTML = `<div class="box">
      <h3>${esc(title)}</h3>
      ${desc ? `<p>${desc}</p>` : ''}
      <div class="acts">
        <button class="btn" data-a="0">${esc(cancelText)}</button>
        <button class="btn ${danger ? 'danger' : 'solid'}" data-a="1">${esc(okText)}</button>
      </div>
    </div>`;
    o.appendChild(box);
    const done = (v) => { box.remove(); resolve(v); };
    box.addEventListener('click', (ev) => {
      const b = ev.target.closest('button[data-a]');
      if (!b) { if (ev.target === box) done(false); return; }
      done(b.dataset.a === '1');
    });
  });
}

/** 单行输入确认框 → Promise<string|null> */
export function promptBox({ title = '', placeholder = '', value = '', okText = '确定' } = {}) {
  return new Promise((resolve) => {
    const o = overlay();
    const box = document.createElement('div');
    box.className = 'confirm';
    box.innerHTML = `<div class="box">
      <h3>${esc(title)}</h3>
      <input class="input" id="promptInput" placeholder="${esc(placeholder)}" value="${esc(value)}" />
      <div class="acts">
        <button class="btn" data-a="0">取消</button>
        <button class="btn solid" data-a="1">${esc(okText)}</button>
      </div>
    </div>`;
    o.appendChild(box);
    const input = box.querySelector('#promptInput');
    input.focus();
    input.select();
    const done = (v) => { box.remove(); resolve(v); };
    box.addEventListener('click', (ev) => {
      const b = ev.target.closest('button[data-a]');
      if (!b) return;
      done(b.dataset.a === '1' ? input.value.trim() : null);
    });
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); done(input.value.trim()); }
    });
  });
}

let toastTimer = null;
/** 提示条，可带一个动作（撤销） */
export function toast(message, { actionLabel = '', onAction = null, duration = 5000 } = {}) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  clearTimeout(toastTimer);
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span>${esc(message)}</span>${actionLabel ? `<button>${esc(actionLabel)}</button>` : ''}`;
  document.body.appendChild(el);
  const kill = () => { el.remove(); clearTimeout(toastTimer); };
  if (actionLabel) {
    el.querySelector('button').addEventListener('click', () => { onAction?.(); kill(); });
  }
  toastTimer = setTimeout(kill, duration);
  return { close: kill };
}

export function emptyState({ text = '还没有内容', actionLabel = '', onAction = null, extra = '' } = {}) {
  return `<div class="empty"><div>${text}</div>${extra}
    ${actionLabel ? `<button class="act" data-empty-act>${esc(actionLabel)}</button>` : ''}</div>`;
}

export function bindEmptyAction(root, onAction) {
  const btn = root.querySelector('[data-empty-act]');
  if (btn && onAction) btn.addEventListener('click', onAction);
}

export function starsHtml(n, { off = '☆☆☆☆☆' } = {}) {
  const v = Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
  const filled = '★★★★★'.slice(0, v);
  const rest = '☆☆☆☆☆'.slice(0, 5 - v);
  return `<span class="stars">${filled}</span><span class="stars off">${rest}</span>`.replace(
    /<span class="stars off"><\/span>/, '');
}
