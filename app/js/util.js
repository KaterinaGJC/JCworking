// DOM 与通用小工具（无第三方依赖）
export * from './core/dates.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

export function debounce(fn, ms = 300) {
  let t = null;
  const wrapped = (...args) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => { t = null; fn(...args); }, ms);
  };
  wrapped.flush = (...args) => { if (t) { clearTimeout(t); t = null; } fn(...args); };
  wrapped.cancel = () => { if (t) { clearTimeout(t); t = null; } };
  return wrapped;
}

/** 事件委托：on(root, 'click', '.item', handler) */
export function delegate(root, type, selector, handler) {
  const fn = (ev) => {
    const target = ev.target instanceof Element ? ev.target.closest(selector) : null;
    if (target && root.contains(target)) handler(ev, target);
  };
  root.addEventListener(type, fn);
  return () => root.removeEventListener(type, fn);
}

let saveTimer = null;
/** 顶栏右侧短暂显示"已保存" */
export function saveTip(text = '已保存 · 刚刚') {
  let el = document.getElementById('saveTip');
  if (!el) {
    el = document.createElement('div');
    el.id = 'saveTip';
    el.style.cssText = 'position:fixed;top:calc(env(safe-area-inset-top) + 10px);right:14px;z-index:90;' +
      'font-size:11.5px;color:var(--text3);background:var(--card);padding:5px 9px;border-radius:9px;' +
      'box-shadow:var(--shadow);opacity:0;transition:opacity .2s;pointer-events:none';
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.style.opacity = '1';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { el.style.opacity = '0'; }, 1600);
}

/**
 * 输入即存 + 中文输入法保护：
 * 拼音组合期间（compositionstart→compositionend）不保存，避免存下半截拼音。
 */
export function bindAutoSave(el, saveFn, { delay = 300 } = {}) {
  let composing = false;
  const run = debounce(() => saveFn(el.value), delay);
  el.addEventListener('compositionstart', () => { composing = true; });
  el.addEventListener('compositionend', () => { composing = false; run(); });
  el.addEventListener('input', () => { if (!composing) run(); });
  el.addEventListener('blur', () => { if (!composing) run.flush(); });
  return { flush: () => run.flush(), cancel: () => run.cancel() };
}

export function download(filename, text, mime = 'application/json') {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function pickFile(accept = '.json,application/json') {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      const f = input.files?.[0];
      input.remove();
      resolve(f ?? null);
    });
    input.click();
  });
}

export function vibrate(ms = 12) {
  try { navigator.vibrate?.(ms); } catch { /* ignore */ }
}

export function autoGrow(ta) {
  const fit = () => {
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 320) + 'px';
  };
  ta.addEventListener('input', fit);
  requestAnimationFrame(fit);
  return fit;
}

export function todayChinese(today = todayStr()) {
  return `${fmtDateCN(today)} ${weekdayCN(today)}`;
}
