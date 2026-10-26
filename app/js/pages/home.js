// 首页总览：今日计划（完整管理区）+ 快速备忘 + 游戏娱乐。不展示教培课表。
// v3 起底部「计划」标签已删除，今日计划只在这里存在，由 plan.js 以组件形式渲染进卡片。
import * as store from '../store.js';
import { buildSummary } from '../core/summary.js';
import { $, esc, uid, todayStr, fmtFullCN, diffDays, weekdayIndex1, relativeCN } from '../util.js';
import { monthMatrix, WEEK_SHORT } from '../core/dates.js';
import { toast } from '../ui.js';
import { tipHtml } from '../tips.js';
import { renderPlan, resetPlan, openTaskEditor, setPlanDate, getPlanDate } from './plan.js';
import {
  MOODS, getMood, setMood, moodLine, moodWeek, MOOD_COLORS,
  moodMapOfMonth, moodStats,
} from '../core/mood.js';

/* ---------------- 首页月历 ---------------- */
// 显示的月份（模块级：切页再回来还停在同一个月）
let calAnchor = null;
const MONTH_EN = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

function calState() {
  const now = new Date();
  if (!calAnchor) calAnchor = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    year: calAnchor.getFullYear(),
    month: calAnchor.getMonth() + 1,       // 1-12
    weekStart: store.state.settings.weekStart === 7 ? 7 : 1,
  };
}

/** 月历内部 HTML（不含外层卡片壳，方便只换这一块） */
function calInnerHtml() {
  const { year, month, weekStart } = calState();
  const today = todayStr();
  const planDate = getPlanDate();
  const cells = monthMatrix(year, month, weekStart);

  // 每天有没有计划、有没有心情
  const taskDays = new Set(store.state.tasks.map((t) => t.date));
  const moodMap = moodMapOfMonth(year, month);

  // 星期表头按"一周从哪天开始"排
  const order = weekStart === 7 ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6, 0];
  const weekRow = order.map((i) => `<span>${WEEK_SHORT[i]}</span>`).join('');

  const dayCells = cells.map((c) => {
    const isToday = c.date === today;
    const isPlan = c.date === planDate;
    const moodId = moodMap[c.date];
    const cls = [
      'cal-d',
      c.inMonth ? '' : 'out',
      isToday ? 'today' : '',
      isPlan && !isToday ? 'picked' : '',
      taskDays.has(c.date) ? 'has-task' : '',
    ].filter(Boolean).join(' ');
    return `<button class="${cls}" data-cal-day="${c.date}" aria-label="${c.date}${isToday ? ' 今天' : ''}">
      <span class="n">${c.day}</span>
      ${moodId ? `<span class="mdot" style="--mood-bg:${MOOD_COLORS[moodId]}"></span>` : ''}
    </button>`;
  }).join('');

  // 本月心情小结
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  const stats = moodStats(from, to).filter((s) => s.days > 0);
  const statHtml = stats.length
    ? stats.map((s) => `<span class="ms"><i style="background:${s.color}"></i>${s.label} ${s.days}</span>`).join('')
    : '<span class="ms muted">这个月还没记心情</span>';

  const isCurMonth = year === new Date().getFullYear() && month === new Date().getMonth() + 1;

  return `
    <div class="cal-head">
      <div class="cal-title">
        <b>${month}月</b>
        <i>${MONTH_EN[month - 1]}</i>
        <em>${year}</em>
      </div>
      <div class="cal-nav">
        <button class="cal-arrow" data-cal-prev aria-label="上个月">‹</button>
        <button class="cal-arrow" data-cal-next aria-label="下个月">›</button>
        <button class="cal-today${isCurMonth ? ' is-cur' : ''}" data-cal-today>今天</button>
      </div>
    </div>
    <div class="cal-week">${weekRow}</div>
    <div class="cal-grid">${dayCells}</div>
    <div class="cal-foot">${statHtml}</div>`;
}


/** 五种心情的小圆脸（内联 SVG，不依赖外部图片） */
function moodFace(id) {
  const eye = '<circle cx="8.2" cy="9" r=".95"/><circle cx="15.8" cy="9" r=".95"/>';
  const faces = {
    happy: `${eye}<path d="M7.6 13.4c1.2 2 2.8 3 4.4 3s3.2-1 4.4-3"/>`,
    sad: `${eye}<path d="M7.6 15.6c1.2-2 2.8-3 4.4-3s3.2 1 4.4 3"/>`,
    angry: '<path d="M6.4 7.2l3.2 1.4M17.6 7.2l-3.2 1.4"/><path d="M7.8 15h8.4"/>',
    calm: '<path d="M7 9.2h2.6M14.4 9.2H17"/><path d="M8.6 14.6h6.8"/>',
    tired: '<path d="M7 9.2h2.6M14.4 9.2H17"/><ellipse cx="12" cy="14.8" rx="1.9" ry="2.3"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
    stroke-linecap="round" stroke-linejoin="round">${faces[id] || faces.calm}</svg>`;
}

function todayTasks() {
  const today = todayStr();
  return store.state.tasks.filter((t) => t.date === today);
}

function showsDueToday() {
  const w = weekdayIndex1(todayStr());
  return store.state.shows.filter((s) => {
    const finished = !!s.ended || (s.total && (s.current || 0) >= s.total);
    return !finished && s.weekday === w;
  });
}

function activitiesNear() {
  const today = todayStr();
  const list = store.state.activities.filter((a) => !a.done);
  const todayDue = list.filter((a) => diffDays(a.due, today) === 0);
  const tomorrowDue = list.filter((a) => diffDays(a.due, today) === 1);
  return { todayDue, tomorrowDue };
}

function latestExperience() {
  const list = [...store.state.experiences].sort(
    (a, b) => (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0),
  );
  return list[0] || null;
}

export async function render(root, ctx = {}) {
  const today = todayStr();
  const tasks = todayTasks();
  const pending = tasks.filter((t) => !t.done);
  const doneCount = tasks.length - pending.length;
  const { todayDue, tomorrowDue } = activitiesNear();
  const shows = showsDueToday();
  const latestExp = latestExperience();
  const notes = [...store.state.notes].sort(
    (a, b) => (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0),
  );
  const mood = getMood(today);

  const summary = buildSummary({
    pendingTasks: pending.length,
    dueToday: todayDue.length,
    dueTomorrow: tomorrowDue.length,
    showsToday: shows.length,
  });

  const box = document.createElement('div');
  box.className = 'home-body';
  box.innerHTML = `
    <div class="hero">
      <div class="date">${fmtFullCN(today)}</div>
      <div class="sum" id="homeSummary">${summary}</div>
      <span class="dnum" aria-hidden="true">${new Date().getDate()}</span>
    </div>

    ${await tipHtml('home')}

    <div class="card mood-card" data-card="mood">
      <div class="card-head">
        <div class="card-title">
          <svg class="ico" style="color:#C6A9C9"><use href="#i-heart"/></svg>今天的心情
        </div>
        <div class="card-meta">${mood ? '已记录' : '点一个圈圈'}</div>
      </div>
      <div class="mood-row" role="group" aria-label="今天的心情">
        ${MOODS.map((m) => `
          <button class="mood${mood?.id === m.id ? ' on' : ''}" data-mood="${m.id}"
                  aria-label="${m.label}" aria-pressed="${mood?.id === m.id ? 'true' : 'false'}">
            <span class="mood-face">${moodFace(m.id)}</span>
            <span class="mood-cap">${m.label}</span>
          </button>`).join('')}
      </div>
      <div class="mood-line" data-mood-line>${esc(moodLine(mood))}</div>
      <div class="mood-week" aria-label="最近七天的心情">
        ${moodWeek(7).map((d) => `
          <span class="wd${d.today ? ' today' : ''}" title="${esc(d.date)}">
            <span class="dot${d.moodId ? ' has' : ''}"${d.moodId ? ` style="--mood-bg:${MOOD_COLORS[d.moodId]}"` : ''}></span>
            ${d.label}
          </span>`).join('')}
      </div>
    </div>

    <div class="card cal-card" data-card="cal">
      ${calInnerHtml()}
    </div>

    <div class="card" data-card="plan">
      <div class="card-head">
        <div class="card-title">
          <svg class="ico" style="color:var(--blue)"><use href="#i-plan"/></svg>今日计划
        </div>
        <div class="card-meta">
          <span class="frac">${doneCount}/${tasks.length}</span>
          <button class="mini-add" data-plan-add aria-label="加一件事" title="加一件事">
            <svg class="ico"><use href="#i-plus"/></svg></button>
        </div>
      </div>
      <div class="plan-slot"></div>
    </div>

    <div class="card" data-card="memo">
      <div class="card-head">
        <div class="card-title">
          <svg class="ico" style="color:var(--amber)"><use href="#i-note"/></svg>快速备忘
        </div>
        <div class="card-meta"><a href="#/memo" style="color:inherit;display:flex">
          <svg class="ico"><use href="#i-right"/></svg></a></div>
      </div>
      ${notes.length ? notes.slice(0, 2).map((n) => `<div class="note-line">
          <span class="t">${esc(n.content)}</span>
          <span class="when">${esc(relativeCN(n.updatedAt ?? n.createdAt ?? Date.now()))}</span>
        </div>`).join('') : '<div class="muted" style="font-size:13.5px;padding:8px 0 4px">还没有便签</div>'}
      <div class="quick-add">
        <input id="homeQuick" placeholder="记点什么…" />
        <button class="go" id="homeQuickSave" aria-label="保存">
          <svg class="ico"><use href="#i-plus"/></svg></button>
      </div>
    </div>

    <a class="card home-card" href="#/fun" data-card="fun">
      <div class="card-head">
        <div class="card-title">
          <svg class="ico" style="color:var(--purple)"><use href="#i-game"/></svg>游戏娱乐
        </div>
        <div class="card-meta"><svg class="ico"><use href="#i-right"/></svg></div>
      </div>
      ${(() => {
        const rows = [];
        for (const a of todayDue.slice(0, 2)) {
          rows.push(`<div class="fun-row"><span class="badge red">今天截止</span>
            <span class="t">${esc(a.title)}</span></div>`);
        }
        for (const a of tomorrowDue.slice(0, 1)) {
          rows.push(`<div class="fun-row"><span class="badge red">还剩 1 天</span>
            <span class="t">${esc(a.title)}</span></div>`);
        }
        for (const s of shows.slice(0, 1)) {
          rows.push(`<div class="fun-row"><span class="badge amber">今天更新</span>
            <span class="t">${esc(s.name)} 第 ${(s.current || 0) + 1} 集</span></div>`);
        }
        if (latestExp) {
          rows.push(`<div class="fun-row"><span class="badge purple">体验</span>
            <span class="t">${esc(latestExp.title)}</span></div>`);
        }
        return rows.length ? rows.join('') : `<div class="muted" style="font-size:13.5px;padding:8px 0 4px">
          最近没有要管的娱乐安排</div>`;
      })()}
    </a>
  `;
  // 先把首页主体插进文档，再填充计划区：
  // 首屏可见性优先，避免"整页等 IndexedDB 往返才出现"拖慢启动（I-01）
  root.replaceChildren(box);
  bind(box, root, ctx);

  // 计划管理区渐进填充；失败只影响这一块，备忘/娱乐卡照常可用
  const slot = $('.plan-slot', box);
  if (slot) {
    try {
      await renderPlan(slot, { rerender: () => render(root, ctx) });
    } catch (err) {
      console.error('[home] 计划区渲染失败', err);
      slot.innerHTML = `<div class="empty">计划区没能加载出来<br>
        <button class="act" data-plan-retry>再试一次</button></div>`;
      $('[data-plan-retry]', slot)?.addEventListener('click', () => render(root, ctx));
    }
  }
}

function bind(box, root, ctx) {
  $('#btnGear').onclick = () => { location.hash = '#/settings'; };

  // 月历：翻月只重画这一块；点日期把下面的计划卡切到那天
  box.addEventListener('click', async (ev) => {
    const nav = ev.target.closest('[data-cal-prev],[data-cal-next],[data-cal-today]');
    if (nav) {
      const now = new Date();
      const s = calState();
      if (nav.hasAttribute('data-cal-prev')) calAnchor = new Date(s.year, s.month - 2, 1);
      else if (nav.hasAttribute('data-cal-next')) calAnchor = new Date(s.year, s.month, 1);
      else calAnchor = new Date(now.getFullYear(), now.getMonth(), 1);
      const card = box.querySelector('.cal-card');
      if (card) card.innerHTML = calInnerHtml();
      return;
    }
    const day = ev.target.closest('[data-cal-day]');
    if (day) {
      setPlanDate(day.dataset.calDay);
      await render(root, ctx);       // 整页重画：计划卡跟着换日期
    }
  });

  // 心情：点一个圈 → 落库 → 就地更新（不整页重渲染，避免打断别处输入）
  box.querySelectorAll?.('[data-mood]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.mood;
      const rec = await setMood(todayStr(), id);
      box.querySelectorAll('[data-mood]').forEach((b) => {
        const on = b.dataset.mood === id;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      const line = box.querySelector('[data-mood-line]');
      if (line) line.textContent = moodLine(rec);
      const meta = box.querySelector('.mood-card .card-meta');
      if (meta) meta.textContent = '已记录';
      // 历史条上"今天"那颗点也要立刻变实心（否则要刷新才看到）
      const todayDot = box.querySelector('.mood-week .wd.today .dot');
      if (todayDot) {
        todayDot.classList.add('has');
        todayDot.style.setProperty('--mood-bg', MOOD_COLORS[id] || '#CBE0F4');
      }
      toast(`记下了：${MOODS.find((m) => m.id === id)?.label || ''}`);
    });
  });

  // 卡片头的 ＋：就地新增一条计划（不占用全局悬浮按钮）
  $('[data-plan-add]', box)?.addEventListener('click', (ev) => {
    ev.preventDefault();
    openTaskEditor();
  });

  // 首页直接记便签
  const input = $('#homeQuick', box);
  const save = async () => {
    const content = input.value.trim();
    if (!content) { input.focus(); return; }
    await store.saveRecord('notes', {
      id: uid(), content, color: 'y', pinned: false, createdAt: Date.now(),
    });
    toast('记下了');
    await render(root, ctx);
  };
  input?.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); save(); }
  });
  $('#homeQuickSave', box)?.addEventListener('click', save);
}

/** 重新进入首页：计划区回到今天、结转提示重新判定 */
export function reset() {
  resetPlan();
}

export function title() { return '景臣'; }
export function subtitle() { return ''; }
