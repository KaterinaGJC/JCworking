// 首页总览：只读聚合（今日计划 / 快速备忘 / 游戏娱乐）。不展示教培课表。
import * as store from '../store.js';
import { buildSummary } from '../core/summary.js';
import {
  $, esc, uid, todayStr, fmtFullCN, addDays, diffDays, weekdayIndex1, relativeCN,
} from '../util.js';
import { toast } from '../ui.js';
import { tipHtml } from '../tips.js';
import { checkCarryover, carryToToday } from './plan.js';

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

  const carry = await checkCarryover();

  const summary = buildSummary({
    pendingTasks: pending.length,
    dueToday: todayDue.length,
    dueTomorrow: tomorrowDue.length,
    showsToday: shows.length,
  });

  const topThree = pending.slice().sort((a, b) => {
    if (a.time && b.time) return a.time < b.time ? -1 : 1;
    if (a.time && !b.time) return -1;
    if (!a.time && b.time) return 1;
    return (a.sort ?? 0) - (b.sort ?? 0);
  }).slice(0, 3);

  const box = document.createElement('div');
  box.className = 'home-body';
  box.innerHTML = `
    <div class="hero">
      <div class="date">${fmtFullCN(today)}</div>
      <div class="sum" id="homeSummary">${summary}</div>
    </div>

    ${await tipHtml('home')}

    ${carry.length ? `<div class="tipcard">
      <button class="x" data-carry="dismiss" aria-label="关闭">×</button>
      昨天有 <b>${carry.length} 项</b>没做完
      <div style="margin-top:8px;display:flex;gap:8px">
        <button class="btn primary" data-carry="move">转到今天</button>
        <button class="btn" data-carry="dismiss">不用了</button>
      </div>
    </div>` : ''}

    <a class="card home-card" href="#/plan" data-card="plan">
      <div class="card-head">
        <div class="card-title">
          <svg class="ico" style="color:var(--blue)"><use href="#i-plan"/></svg>今日计划
        </div>
        <div class="card-meta"><span class="frac">${doneCount}/${tasks.length}</span>
          <svg class="ico"><use href="#i-right"/></svg></div>
      </div>
      ${topThree.length ? `<ul class="mini-list">
        ${topThree.map((t) => `<li>
          <span class="cbox" data-home-toggle="${t.id}" role="checkbox" aria-checked="false"></span>
          ${t.time ? `<span class="when">${esc(t.time)}</span>` : '<span class="when"></span>'}
          <span class="t">${esc(t.title)}</span>
        </li>`).join('')}
      </ul>` : `<div class="muted" style="font-size:13.5px;padding:8px 0 4px">
        ${tasks.length ? '今天的事都做完了' : '今天还没有安排'}</div>`}
    </a>

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
  root.replaceChildren(box);
  bind(box, root, carry);
}

function bind(box, root, carry) {
  $('#btnGear').onclick = () => { location.hash = '#/settings'; };

  // 首页直接勾选（计划页同款数据）
  box.addEventListener('click', async (ev) => {
    const c = ev.target.closest('[data-home-toggle]');
    if (c) {
      ev.preventDefault();
      ev.stopPropagation();
      const t = store.state.tasks.find((x) => x.id === c.dataset.homeToggle);
      if (!t) return;
      await store.saveRecord('tasks', { ...t, done: true, doneAt: Date.now() });
      toast('做完了');
      await render(root);
      return;
    }

    const carryBtn = ev.target.closest('[data-carry]');
    if (carryBtn) {
      ev.preventDefault();
      if (carryBtn.dataset.carry === 'move') {
        const n = carry.length ? await carryToToday(carry) : 0;
        toast(n ? `已把 ${n} 项转到今天` : '没有要转的');
      } else {
        toast('好的，不动它们');
      }
      await render(root);
    }
  });

  const input = $('#homeQuick', box);
  const save = async () => {
    const content = input.value.trim();
    if (!content) { input.focus(); return; }
    await store.saveRecord('notes', {
      id: uid(), content, color: 'y', pinned: false, createdAt: Date.now(),
    });
    toast('记下了');
    await render(root);
  };
  input?.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); save(); }
  });
  $('#homeQuickSave', box)?.addEventListener('click', save);

  void addDays;
}

export function title() { return '景臣'; }
export function subtitle() { return ''; }
