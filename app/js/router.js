import { $ } from './util.js';
import { hasOverlay, closeOverlayAndHistory } from './ui.js';

export const ROUTES = {
  home:     { title: '景臣',     action: 'gear',     tab: 'home' },
  plan:     { title: '今日计划', action: 'plus',     tab: 'plan' },
  schedule: { title: '教培课表', action: 'students', tab: 'schedule' },
  fun:      { title: '游戏娱乐', action: 'plus',     tab: 'fun' },
  memo:     { title: '快速备忘', action: 'search',   tab: 'memo' },
  lesson:   { title: '课次详情', back: true, parent: 'schedule' },
  students: { title: '学生',     back: true, parent: 'schedule' },
  student:  { title: '学生档案', back: true, parent: 'students' },
  settings: { title: '数据与设置', back: true, parent: 'home' },
};

const pageCache = new Map();
let currentId = null;
let currentParams = {};
let mounted = null;
let lastHash = location.hash || '#/home';

/** 最近一次真正渲染出来的页面地址（用于返回键"取消导航"时恢复） */
export function currentHash() {
  return lastHash;
}

function stubModule(id) {
  return {
    render(root) {
      root.innerHTML = `<div class="empty">「${ROUTES[id]?.title || id}」正在开发中</div>`;
    },
  };
}

export function currentRoute() {
  return { id: currentId, params: currentParams };
}

export function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [idPart, queryPart] = raw.split('?');
  const id = ROUTES[idPart] ? idPart : 'home';
  const params = {};
  if (queryPart) {
    for (const [k, v] of new URLSearchParams(queryPart)) params[k] = v;
  }
  return { id, params };
}

export function go(id, params = {}) {
  const qs = new URLSearchParams(params).toString();
  location.hash = `#/${id}${qs ? '?' + qs : ''}`;
}

/** 用替换的方式跳到某个页面，不往历史里堆新记录 */
export function replaceTo(id, params = {}) {
  const qs = new URLSearchParams(params).toString();
  history.replaceState(null, '', `#/${id}${qs ? '?' + qs : ''}`);
  return renderRoute();
}

/**
 * 返回的优先级：
 * 1) 有弹层 → 先收弹层（不退出页面）
 * 2) 详情页 → 回到它的上一级页面
 * 3) 各板块一级界面 → 回首页
 * 4) 首页 → 走浏览器历史（退出应用）
 */
export function back() {
  if (hasOverlay()) { closeOverlayAndHistory(); return Promise.resolve(); }
  const route = ROUTES[currentId];
  if (route?.parent) return replaceTo(route.parent);
  if (route?.tab && route.tab !== 'home') return replaceTo('home');
  if (history.length > 1) history.back();
  else location.hash = '#/home';
  return Promise.resolve();
}

async function loadPage(id) {
  if (!pageCache.has(id)) {
    pageCache.set(id, import(`./pages/${id}.js`).catch((err) => {
      if (err instanceof TypeError || /Failed to fetch|Importing a module script failed|Cannot find module/i.test(String(err))) {
        return stubModule(id);
      }
      throw err;
    }));
  }
  return pageCache.get(id);
}

function updateChrome(id, mod) {
  const r = ROUTES[id];
  const isDetail = !!r.back;
  // 一级界面（除首页）也给一个返回入口，点了直接回首页
  const showBack = isDetail || (r.tab && r.tab !== 'home');

  $('#btnBack').classList.toggle('hidden', !showBack);
  $('#btnGear').classList.toggle('hidden', r.action !== 'gear');
  $('#btnStu').classList.toggle('hidden', r.action !== 'students');
  $('#btnPlus').classList.toggle('hidden', r.action !== 'plus');
  $('#btnSearch').classList.toggle('hidden', r.action !== 'search');

  $('#tabbar').hidden = isDetail;
  document.body.classList.toggle('detail', isDetail);
  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('on', t.dataset.act === (r.tab || ''));
  });

  const titleEl = $('#pageTitle');
  const subEl = $('#pageSub');
  const title = typeof mod.title === 'function' ? mod.title() : (r.title || '');
  titleEl.textContent = title;
  let sub = typeof mod.subtitle === 'function' ? mod.subtitle() : '';
  if (sub && typeof sub.then === 'function') sub = ''; // 不允许 Promise 漏进 DOM
  subEl.textContent = sub;
  subEl.style.display = sub ? '' : 'none';
  document.title = title ? `${title} · 景臣的工作生活` : '景臣的工作生活';

  const fab = $('#fab');
  fab.hidden = !(id === 'plan' || id === 'fun' || id === 'schedule');
  fab.onclick = null;
  fab.setAttribute('aria-label', id === 'schedule' ? '新加一节课' : '新增');
  // 顶栏那枚 ＋ 每次换页清空，由页面自己绑，避免上个页面的处理器残留
  const plusBtn = $('#btnPlus');
  if (plusBtn) plusBtn.onclick = null;
}

export async function renderRoute() {
  const { id, params } = parseHash();
  const prev = currentId;
  currentId = id;
  currentParams = params;
  lastHash = location.hash || '#/home';

  const mod = await loadPage(id);

  /**
   * 「重新进入某个板块」时要回到该板块的初始一级界面：
   * - 上一个页面是别的一级页面（底部标签切换）→ 重置
   * - 上一个页面是它自己的详情页（返回）→ 保留，否则从课次返回会丢掉刚才看的周
   */
  const isTabRoot = !!ROUTES[id]?.tab;
  const prevIsDetail = !!(prev && ROUTES[prev]?.back);
  if (isTabRoot && prev && prev !== id && !prevIsDetail) {
    try { mod.reset?.(); } catch (err) { console.warn('[router] reset', err); }
  }

  try { mounted?.unmount?.(); } catch { /* ignore */ }
  mounted = null;

  const view = $('#view');
  view.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'page';
  root.dataset.page = id;
  view.appendChild(root);

  updateChrome(id, mod);
  const result = await mod.render(root, { params, go, back });
  mounted = result ?? null;
}

export function startRouter() {
  window.addEventListener('hashchange', () => { renderRoute().catch(onError); });

  // 再次点击当前所在的标签：也回到该板块的初始界面
  document.querySelectorAll('.tab').forEach((tabEl) => {
    tabEl.addEventListener('click', async (ev) => {
      if (!tabEl.classList.contains('on')) return;
      ev.preventDefault();
      const id = tabEl.dataset.act;
      const mod = await loadPage(id);
      try { mod.reset?.(); } catch { /* ignore */ }
      await renderRoute();
    });
  });

  if (!location.hash) location.replace('#/home');
  return renderRoute();
}

function onError(err) {
  console.error('[router]', err);
  const view = $('#view');
  if (view) {
    view.innerHTML = `<div class="empty">页面出错了：${String(err?.message || err)}</div>`;
  }
}
