import { initTheme, applyTheme, applyBackground } from './theme.js';
import { startRouter, back, go, currentHash } from './router.js';
import { loadAll, state as storeState } from './store.js';
import { maybeDailySnapshot } from './backup.js';
import { $ } from './util.js';
import { hasOverlay, closeTopOverlay } from './ui.js';
import { imageUrl } from './image.js';

initTheme();

$('#btnBack').addEventListener('click', () => back());

// 手机上的实体/手势返回键：还有弹层时先收弹层，并把地址恢复回去（等于取消这次返回）。
// 注意：不要在这里改判页面层级——hash 变化的时机不可靠，会把正常切页也当成"返回"。
window.addEventListener('popstate', () => {
  if (!hasOverlay()) return;
  closeTopOverlay();
  const restore = currentHash();
  try {
    if (restore && location.hash !== restore) history.pushState(null, '', restore);
  } catch { /* ignore */ }
});

window.addEventListener('error', (e) => console.error('[app error]', e.error || e.message));
window.addEventListener('unhandledrejection', (e) => console.error('[app rejection]', e.reason));

async function boot() {
  playSplash();
  try {
    await loadAll();
    applyTheme(storeState.settings.theme);
    applyBackground(imageUrl(storeState.settings.backgroundId));
  } catch (err) {
    console.error('[boot] 数据加载失败', err);
  }
  try {
    await maybeDailySnapshot();
  } catch (err) {
    console.warn('[boot] 快照失败', err);
  }
  await startRouter();
}

/**
 * 开屏：手账本翻开。
 * - 尊重 prefers-reduced-motion：直接不播（动画全在 CSS 里）
 * - 同一浏览器会话只播一次，避免每次刷新都挡一下
 * - 元素本身 pointer-events:none，绝不阻塞操作；到点自动移除
 */
function playSplash() {
  const el = document.getElementById('splash');
  if (!el) return;
  let seen = false;
  try { seen = sessionStorage.getItem('jc-splash') === '1'; } catch { /* 隐私模式 */ }
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  if (seen || reduce) { el.remove(); return; }
  try { sessionStorage.setItem('jc-splash', '1'); } catch { /* ignore */ }
  const finish = () => {
    el.classList.add('hide');
    setTimeout(() => el.remove(), 340);
  };
  setTimeout(finish, 1360);   // 与 CSS 里的动画时长/延迟对齐（240ms + 980ms）
  el.addEventListener('click', finish, { once: true });
}

boot().catch((err) => {
  console.error('[boot]', err);
  const view = $('#view');
  if (view) view.innerHTML = `<div class="empty">启动失败：${String(err?.message || err)}</div>`;
});

// 调试用：window.__jc 暴露少量入口，方便自动化测试与排查
window.__jc = { go, back, state: storeState };

// 说明卡关闭（所有页面共用一个处理）
document.addEventListener('click', (ev) => {
  const x = ev.target.closest?.('[data-tip-close]');
  if (!x) return;
  x.closest('.tipcard')?.remove();
});

// 测试数据生成器：设置页连点版本号，或测试里直接调用 window.__jc.seed()
import('./dev.js').then((m) => { window.__jc.seed = m.seedTestData; }).catch(() => {});

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('[sw] register failed', err));
  });
}
