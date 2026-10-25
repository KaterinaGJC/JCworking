export const THEMES = ['light', 'dark', 'auto'];

let current = 'auto';
const mq = () => window.matchMedia('(prefers-color-scheme: dark)');

/** 设置/清除全局背景底图（传 dataURL，传空即关闭） */
export function applyBackground(dataUrl) {
  const root = document.documentElement;
  if (dataUrl) {
    root.classList.add('has-bg');
    root.style.setProperty('--bg-image', `url("${dataUrl}")`);
  } else {
    root.classList.remove('has-bg');
    root.style.removeProperty('--bg-image');
  }
}

export function resolveTheme(t) {
  if (t === 'dark') return 'dark';
  if (t === 'light') return 'light';
  return mq().matches ? 'dark' : 'light';
}

export function applyTheme(t) {
  current = THEMES.includes(t) ? t : 'auto';
  const resolved = resolveTheme(current);
  document.documentElement.dataset.theme = resolved;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolved === 'dark' ? '#14161A' : '#F4F5F7');
  try { localStorage.setItem('jc-theme', current); } catch { /* ignore */ }
  return resolved;
}

export function currentTheme() {
  return current;
}

export function initTheme() {
  let cached = 'auto';
  try { cached = localStorage.getItem('jc-theme') || 'auto'; } catch { /* ignore */ }
  applyTheme(cached);
  mq().addEventListener('change', () => { if (current === 'auto') applyTheme('auto'); });
}
