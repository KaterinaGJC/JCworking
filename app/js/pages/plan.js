// 今日计划：待安排 + 时间轴 + 已完成；重复规则惰性生成；昨日结转
import * as store from '../store.js';
import { shouldGenerate, repeatLabel, normalizeRepeat } from '../core/repeat.js';
import { $, $$, esc, uid, todayStr, fmtFullCN, addDays, monthMatrix } from '../util.js';
import { sheet, confirmBox, toast, emptyState } from '../ui.js';
import { tipHtml } from '../tips.js';

let viewDate = null;
let pendingCarry = null;
let carryHandled = false;
let suppressClickUntil = 0;

const DAY_CN = ['', '一', '二', '三', '四', '五', '六', '日'];

const tasksOn = (date) => store.state.tasks.filter((t) => t.date === date);
const pendingOn = (date) => tasksOn(date).filter((t) => !t.done);

/* ---------------- 重复任务：惰性生成 ---------------- */
export async function ensureGenerated(date) {
  const templates = store.state.tasks.filter(
    (t) => t.repeat && t.repeat.type !== 'none' && !t.repeat.sourceId,
  );
  const existing = new Set(
    store.state.tasks.filter((t) => t.date === date && t.repeat?.sourceId).map((t) => t.repeat.sourceId),
  );
  const toAdd = [];
  for (const tpl of templates) {
    if (!shouldGenerate(tpl.repeat, tpl.date, date)) continue;
    if (existing.has(tpl.id)) continue;
    if (tpl.date === date) continue; // 模板当天本身就是实例
    toAdd.push({
      id: uid(),
      date,
      title: tpl.title,
      time: tpl.time || null,
      note: tpl.note || '',
      repeat: { type: 'none', weekdays: [], sourceId: tpl.id },
      done: false,
      doneAt: null,
      sort: tpl.sort ?? 0,
      createdAt: Date.now(),
    });
  }
  if (toAdd.length) await store.saveMany('tasks', toAdd);
  return toAdd.length;
}

/* ---------------- 昨日结转 ---------------- */
export async function checkCarryover() {
  const today = todayStr();
  if (store.getMeta('lastOpenDate') === today) return [];
  await store.setMeta('lastOpenDate', today);
  const yesterday = addDays(today, -1);
  return pendingOn(yesterday).filter((t) => !t.repeat || t.repeat.type === 'none');
}

export async function carryToToday(tasks) {
  const today = todayStr();
  const copies = tasks.map((t) => ({
    ...t,
    id: uid(),
    date: today,
    done: false,
    doneAt: null,
    repeat: { type: 'none', weekdays: [], sourceId: t.id },
    createdAt: Date.now(),
  }));
  await store.saveMany('tasks', copies);
  return copies.length;
}

/* ---------------- 渲染 ---------------- */
function itemHtml(t, withTime) {
  return `<div class="titem${t.done ? ' done' : ''}" data-id="${t.id}">
    ${withTime ? `<div class="time">${esc(t.time || '')}</div>` : ''}
    <div class="body" data-open="${t.id}" role="button" tabindex="0">
      <div class="t">${esc(t.title)}</div>
      ${t.note ? `<div class="d">${esc(t.note)}</div>` : ''}
      ${t.repeat && t.repeat.type !== 'none' ? `<div class="d">${esc(repeatLabel(t.repeat))}</div>` : ''}
    </div>
    <span class="cbox${t.done ? ' done' : ''}" data-toggle="${t.id}" role="checkbox"
      aria-checked="${t.done}"></span>
  </div>`;
}

export async function render(root) {
  if (!viewDate) viewDate = todayStr();
  await ensureGenerated(viewDate);

  if (pendingCarry === null) pendingCarry = await checkCarryover();
  const carry = carryHandled ? [] : pendingCarry;

  const all = tasksOn(viewDate);
  const pending = all.filter((t) => !t.done);
  const noTime = pending.filter((t) => !t.time).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  const timed = pending.filter((t) => t.time).sort((a, b) => (a.time < b.time ? -1 : 1));
  const done = all.filter((t) => t.done);

  const box = document.createElement('div');
  box.className = 'plan-body';
  box.innerHTML = `
    <div class="datebar">
      <button class="icon-btn" data-nav="-1" aria-label="前一天"><svg class="ico"><use href="#i-left"/></svg></button>
      <button class="mid" data-act="calendar">${fmtFullCN(viewDate)}</button>
      <button class="icon-btn" data-nav="1" aria-label="后一天"><svg class="ico"><use href="#i-right"/></svg></button>
      <button class="today" data-act="today">今天</button>
    </div>

    ${await tipHtml('plan')}

    ${carry.length ? `<div class="tipcard">
      <button class="x" data-carry="dismiss" aria-label="关闭">×</button>
      昨天有 <b>${carry.length} 项</b>没做完
      <div style="margin-top:8px;display:flex;gap:8px">
        <button class="btn primary" data-carry="move">转到今天</button>
        <button class="btn" data-carry="dismiss">不用了</button>
      </div>
    </div>` : ''}

    ${!all.length ? emptyState({
      text: '这一天还没有安排',
      actionLabel: '加一条',
      extra: '<div class="small" style="margin-top:6px">想先记下来也行，不用填时间</div>',
    }) : `
      <div class="sec-title">待安排</div>
      <div class="card tight" id="noTimeList">
        ${noTime.length ? noTime.map((t) => itemHtml(t, false)).join('')
          : `<div class="titem"><div class="body muted" style="font-size:13.5px">没有未安排时间的事</div></div>`}
      </div>

      <div class="sec-title">时间轴</div>
      <div class="card tight">
        ${timed.length ? timed.map((t) => itemHtml(t, true)).join('')
          : `<div class="titem"><div class="body muted" style="font-size:13.5px">加了时间的事会排在这里</div></div>`}
      </div>

      <div class="donegroup open" id="doneGroup">
        <button class="h" data-act="toggleDone">
          <span>已完成 · ${done.length} 项</span>
          <svg class="ico"><use href="#i-down"/></svg>
        </button>
        <div class="list">
          <div class="card tight">
            ${done.length ? done.map((t) => itemHtml(t, !!t.time)).join('')
              : '<div class="titem"><div class="body muted" style="font-size:13.5px">还没有完成的</div></div>'}
          </div>
        </div>
      </div>
    `}
  `;
  root.replaceChildren(box);
  bind(box, root, carry);
}

function bind(box, root, carry) {
  // 日期切换 / 今天 / 月历 / 已完成折叠
  box.addEventListener('click', async (ev) => {
    const nav = ev.target.closest('[data-nav]');
    if (nav) {
      viewDate = addDays(viewDate, Number(nav.dataset.nav));
      await render(root);
      return;
    }
    const act = ev.target.closest('[data-act]')?.dataset.act;
    if (act === 'today') { viewDate = todayStr(); await render(root); return; }
    if (act === 'calendar') { openCalendar(root); return; }
    if (act === 'toggleDone') { $('#doneGroup', box)?.classList.toggle('open'); return; }
    const emptyBtn = ev.target.closest('[data-empty-act]');
    if (emptyBtn) openEditor(root, null);
  });

  // 结转
  box.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-carry]');
    if (!b) return;
    carryHandled = true;
    if (b.dataset.carry === 'move') {
      const n = await carryToToday(carry);
      toast(`已把 ${n} 项转到今天`);
    } else {
      toast('好的，不动它们');
    }
    await render(root);
  });

  // 勾选
  box.addEventListener('click', async (ev) => {
    const c = ev.target.closest('[data-toggle]');
    if (!c) return;
    ev.stopPropagation();
    const t = store.state.tasks.find((x) => x.id === c.dataset.toggle);
    if (!t) return;
    await store.saveRecord('tasks', { ...t, done: !t.done, doneAt: !t.done ? Date.now() : null });
    await render(root);
  });

  // 打开编辑
  box.addEventListener('click', (ev) => {
    if (Date.now() < suppressClickUntil) return; // 刚拖动完，别顺手打开编辑
    const open = ev.target.closest('[data-open]');
    if (!open) return;
    const t = store.state.tasks.find((x) => x.id === open.dataset.open);
    if (t) openEditor(root, t);
  });

  // FAB 与顶栏＋都用来新增
  const addOne = () => openEditor(root, null);
  $('#fab').onclick = addOne;
  const plusBtn = $('#btnPlus');
  if (plusBtn) plusBtn.onclick = addOne;

  enableDragSort(box, root);
}

function enableDragSort(box, root) {
  const list = $('#noTimeList', box);
  if (!list) return;
  let dragEl = null;
  let timer = null;
  let active = false;

  const startPress = (ev) => {
    const item = ev.target.closest('.titem[data-id]');
    if (!item || ev.target.closest('.cbox')) return;
    timer = setTimeout(() => {
      active = true;
      dragEl = item;
      item.classList.add('dragging');
      try { navigator.vibrate?.(15); } catch { /* ignore */ }
    }, 420);
  };
  const move = (ev) => {
    if (!active || !dragEl) return;
    ev.preventDefault();
    const under = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.titem[data-id]');
    if (!under || under === dragEl || !list.contains(under)) return;
    const rect = under.getBoundingClientRect();
    const after = ev.clientY > rect.top + rect.height / 2;
    list.insertBefore(dragEl, after ? under.nextSibling : under);
  };
  const end = async () => {
    clearTimeout(timer);
    if (!active) return;
    active = false;
    dragEl?.classList.remove('dragging');
    const order = $$('.titem[data-id]', list);
    const updates = order.map((el, i) => {
      const t = store.state.tasks.find((x) => x.id === el.dataset.id);
      return t ? { ...t, sort: i * 10 } : null;
    }).filter(Boolean);
    dragEl = null;
    suppressClickUntil = Date.now() + 350;
    if (updates.length) {
      await store.saveMany('tasks', updates);
      toast('顺序已保存');
      await render(root);
    }
  };

  list.addEventListener('pointerdown', startPress);
  list.addEventListener('pointermove', move);
  list.addEventListener('pointerup', end);
  list.addEventListener('pointercancel', end);
}

/* ---------------- 编辑面板 ---------------- */
function openEditor(root, task) {
  const isNew = !task;
  const draft = {
    repeat: normalizeRepeat(task?.repeat),
  };

  const repeatBtns = [['none', '不重复'], ['daily', '每天'], ['weekly', '每周']]
    .map(([v, l]) => `<button class="tag ${draft.repeat.type === v ? 'on' : ''}" data-repeat="${v}">${l}</button>`)
    .join('');
  const weekdayChips = DAY_CN.slice(1).map((n, i) => {
    const w = i + 1;
    return `<button class="tag ${draft.repeat.weekdays.includes(w) ? 'on' : ''}" data-weekday="${w}">${n}</button>`;
  }).join('');

  let saveFn = () => {};

  sheet({
    title: isNew ? '加一件事' : '改一下',
    body: `
      <input class="input" id="f-title" placeholder="要做什么？" value="${esc(task?.title ?? '')}" />
      <div class="field" style="margin-top:12px">
        <label>时间（可不填）</label>
        <input class="input" id="f-time" type="time" value="${esc(task?.time ?? '')}" />
      </div>
      <div class="field">
        <label>备注（可不填）</label>
        <textarea class="textarea" id="f-note" rows="2" placeholder="补充说明">${esc(task?.note ?? '')}</textarea>
      </div>
      <div class="field">
        <label>重复</label>
        <div class="tagset" id="f-repeat">${repeatBtns}</div>
        <div class="tagset" id="f-weekdays" style="margin-top:8px;${draft.repeat.type === 'weekly' ? '' : 'display:none'}">${weekdayChips}</div>
      </div>
      ${isNew ? '' : '<button class="btn danger" id="f-del" style="width:100%;margin-top:4px">删除这一条</button>'}
    `,
    actions: [
      { label: '取消', onClick: (close) => close() },
      { label: '保存', kind: 'blue', onClick: (close) => { close(); saveFn(); } },
    ],
    onMount: (el, close) => {
      const titleEl = $('#f-title', el);
      const timeEl = $('#f-time', el);
      const noteEl = $('#f-note', el);
      titleEl.focus();

      const repBox = $('#f-repeat', el);
      const weekBox = $('#f-weekdays', el);
      repBox.addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-repeat]');
        if (!b) return;
        draft.repeat.type = b.dataset.repeat;
        repBox.querySelectorAll('.tag').forEach((x) => x.classList.toggle('on', x === b));
        weekBox.style.display = draft.repeat.type === 'weekly' ? '' : 'none';
        if (draft.repeat.type !== 'weekly') draft.repeat.weekdays = [];
      });
      weekBox.addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-weekday]');
        if (!b) return;
        const w = Number(b.dataset.weekday);
        const set = new Set(draft.repeat.weekdays);
        if (set.has(w)) set.delete(w); else set.add(w);
        draft.repeat.weekdays = [...set].sort((a, b2) => a - b2);
        b.classList.toggle('on');
      });

      saveFn = async () => {
        const title = titleEl.value.trim();
        if (!title) { toast('先写点什么吧'); return; }
        if (draft.repeat.type === 'weekly' && !draft.repeat.weekdays.length) {
          toast('每周重复要选星期几');
          return;
        }
        const rec = {
          id: task?.id ?? uid(),
          date: task?.date ?? viewDate,
          title,
          time: timeEl.value || null,
          note: noteEl.value.trim(),
          repeat: {
            type: draft.repeat.type,
            weekdays: draft.repeat.type === 'weekly' ? draft.repeat.weekdays : [],
            sourceId: task?.repeat?.sourceId ?? null,
          },
          done: task?.done ?? false,
          doneAt: task?.doneAt ?? null,
          sort: task?.sort ?? (tasksOn(viewDate).filter((t) => !t.time).length * 10),
          createdAt: task?.createdAt ?? Date.now(),
        };
        await store.saveRecord('tasks', rec);
        toast(isNew ? '加好了' : '已保存');
        await render(root);
      };

      titleEl.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); close(); saveFn(); }
      });

      const del = $('#f-del', el);
      if (del) {
        del.addEventListener('click', async () => {
          close();
          await removeTask(root, task);
        });
      }
    },
  });
}

async function removeTask(root, task) {
  const yes = await confirmBox({
    title: '删掉这一条？',
    desc: esc(task.title),
    okText: '删除',
    danger: true,
  });
  if (!yes) return;
  await store.removeRecord('tasks', task.id);
  await render(root);
  toast('已删除', {
    actionLabel: '撤销',
    onAction: async () => {
      await store.saveRecord('tasks', task);
      await render(root);
    },
  });
}

/* ---------------- 月历 ---------------- */
function openCalendar(root) {
  let cursor = viewDate.slice(0, 7);

  const draw = () => {
    const [y, m] = cursor.split('-').map(Number);
    const ws = store.state.settings.weekStart === 7 ? 7 : 1;
    const cells = monthMatrix(y, m, ws);
    const heads = (ws === 7
      ? ['日', '一', '二', '三', '四', '五', '六']
      : ['一', '二', '三', '四', '五', '六', '日'])
      .map((d) => `<div class="cw">${d}</div>`).join('');
    return `<div class="cbar">
        <button class="icon-btn" data-cnav="-1" aria-label="上个月"><svg class="ico"><use href="#i-left"/></svg></button>
        <div class="cm">${y}年${m}月</div>
        <button class="icon-btn" data-cnav="1" aria-label="下个月"><svg class="ico"><use href="#i-right"/></svg></button>
      </div>
      <div class="cgrid">${heads}${cells.map((c) => `
        <button class="cd${c.inMonth ? '' : ' dim'}${c.date === viewDate ? ' sel' : ''}${
          c.date === todayStr() ? ' today-mark' : ''}" data-day="${c.date}">${c.day}</button>`).join('')}
      </div>`;
  };

  const handle = sheet({
    title: '跳到哪一天',
    body: `<div class="calendar">${draw()}</div>`,
    actions: [{ label: '关闭', onClick: (close) => close() }],
    onMount: (el) => {
      el.addEventListener('click', async (ev) => {
        const nav = ev.target.closest('[data-cnav]');
        if (nav) {
          const [y, m] = cursor.split('-').map(Number);
          const d = new Date(y, m - 1 + Number(nav.dataset.cnav), 1);
          cursor = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          $('.calendar', el).innerHTML = draw();
          return;
        }
        const day = ev.target.closest('[data-day]');
        if (day?.dataset.day) {
          viewDate = day.dataset.day;
          handle.close();
          await render(root);
        }
      });
    },
  });
}

export function reset() {
  viewDate = null;
  pendingCarry = null;
  carryHandled = false;
}

export function title() { return '今日计划'; }
export function subtitle() { return ''; }
