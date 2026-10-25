import { $ } from './util.js';

export const ROUTES = {
  home:     { title: '景臣',     action: 'gear',     tab: 'home' },
  plan:     { title: '今日计划', action: 'plus',     tab: 'plan' },
  schedule: { title: '教培课表', action: 'students', tab: 'schedule' },
  fun:      { title: '游戏娱乐', action: 'plus',     tab: 'fun' },
  memo:     { title: '快速备忘', action: 'search',   tab: 'memo' },
  lesson:   { title: '课次详情', back: true },
  students: { title: '学生',     back: true },
  student:  { title: '学生档案', back: true },
  settings: { title: '数据与设置', back: true },
};

const pageCache = new Map();
let currentId = null;
let currentParams = {};
let mounted = null;

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

export function back() {
  if (history.length > 1) history.back();
  else location.hash = '#/home';
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

  $('#btnBack').classList.toggle('hidden', !isDetail);
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
  fab.hidden = !(id === 'plan' || id === 'fun');
  fab.onclick = null;
  // 顶栏那枚 ＋ 每次换页清空，由页面自己绑，避免上个页面的处理器残留
  const plusBtn = $('#btnPlus');
  if (plusBtn) plusBtn.onclick = null;
}

export async function renderRoute() {
  const { id, params } = parseHash();
  currentId = id;
  currentParams = params;

  const mod = await loadPage(id);
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
