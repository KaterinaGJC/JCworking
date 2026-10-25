// 教培课表：节次网格（像中学课表）+ 新建课 + 重复课惰性生成
import * as store from '../store.js';
import { shouldGenerate } from '../core/repeat.js';
import { getSlots, slotForLesson, slotById, slotDuration } from '../core/slots.js';
import {
  $, esc, uid, todayStr, addDays, startOfWeek, weekDates, fmtMD, weekdayCN,
  endTimeHM, uid as newId,
} from '../util.js';
import { sheet, toast, confirmBox, emptyState } from '../ui.js';
import { tipHtml } from '../tips.js';

let viewAnchor = null; // 当前周的任意一天

export const STATUS = {
  todo: { label: '未上', cls: '' },
  done: { label: '已上', cls: 'done' },
  leave: { label: '请假', cls: 'leave' },
  makeup: { label: '补课', cls: 'makeup' },
};

export function studentsOf(lesson) {
  return lesson.members || [];
}

export function memberNames(lesson) {
  return studentsOf(lesson).map((m) => m.name).filter(Boolean);
}

export function nameSummary(lesson, max = 2) {
  const names = memberNames(lesson);
  if (!names.length) return '未填学生';
  if (names.length <= max) return names.join('、');
  return `${names.slice(0, max).join('、')} +${names.length - max}`;
}

export function timeRange(lesson) {
  return `${lesson.start}–${endTimeHM(lesson.start, lesson.duration || 90)}`;
}

/* ---------- 重复课惰性生成 ---------- */
export async function ensureLessonsFor(date) {
  const templates = store.state.lessons.filter(
    (l) => l.repeat && l.repeat.type !== 'none' && !l.repeat.sourceId,
  );
  const existing = new Set(
    store.state.lessons.filter((l) => l.date === date && l.repeat?.sourceId).map((l) => l.repeat.sourceId),
  );
  const toAdd = [];
  for (const tpl of templates) {
    if (tpl.date === date) continue;
    if (existing.has(tpl.id)) continue;
    if (!shouldGenerate(tpl.repeat, tpl.date, date)) continue;
    toAdd.push({
      ...tpl,
      id: newId(),
      date,
      status: 'todo',
      content: '',
      homework: '',
      repeat: { type: 'none', weekdays: [], sourceId: tpl.id },
      members: (tpl.members || []).map((m) => ({ ...m, attendance: 'todo', state: null, note: '' })),
      createdAt: Date.now(),
    });
  }
  if (toAdd.length) await store.saveMany('lessons', toAdd);
  return toAdd.length;
}

/* ---------- 学生名录 ---------- */
export async function ensureStudent(name) {
  const clean = String(name || '').trim();
  if (!clean) return null;
  const hit = store.state.students.find((s) => s.name === clean);
  if (hit) return hit;
  const rec = { id: uid(), name: clean, createdAt: Date.now() };
  await store.saveRecord('students', rec);
  return rec;
}

export async function renameStudent(studentId, newName, oldName) {
  const s = store.state.students.find((x) => x.id === studentId);
  if (s) await store.saveRecord('students', { ...s, name: newName });
  // 同步所有历史课次里的姓名
  const touched = store.state.lessons.filter((l) => (l.members || []).some((m) => m.studentId === studentId));
  for (const l of touched) {
    const members = l.members.map((m) => (m.studentId === studentId ? { ...m, name: newName } : m));
    await store.saveRecord('lessons', { ...l, members });
  }
  void oldName;
}

export function countDoneFor(studentId) {
  return store.state.lessons.filter(
    (l) => l.status === 'done' && (l.members || []).some((m) => m.studentId === studentId && m.attendance !== 'leave'),
  ).length;
}

export function lessonsOf(studentId) {
  return store.state.lessons
    .filter((l) => (l.members || []).some((m) => m.studentId === studentId))
    .sort((a, b) => (a.date === b.date ? (a.start < b.start ? 1 : -1) : (a.date < b.date ? 1 : -1)));
}

/* ---------- 渲染 ---------- */
export async function render(root) {
  if (!viewAnchor) viewAnchor = todayStr();
  const weekStart = store.state.settings.weekStart === 7 ? 7 : 1;
  const dates = weekDates(viewAnchor, weekStart);
  for (const d of dates) await ensureLessonsFor(d);

  const range = `${fmtMD(dates[0])} – ${fmtMD(dates[6])}`;
  const today = todayStr();
  const slots = getSlots(store.state.settings);
  const lessonsOfDay = (d) => store.state.lessons.filter((l) => l.date === d);

  // 网格：行 = 节次，列 = 星期；落不到任何节次的课单独列在下方
  const gridRows = slots.map((slot) => {
    const cells = dates.map((d) => {
      const cellLessons = lessonsOfDay(d).filter((l) => slotForLesson(slots, l)?.id === slot.id);
      if (cellLessons.length) {
        return `<div class="tt-cell has-lesson" data-day="${d}" data-slot="${slot.id}">
          ${cellLessons.map((l) => lessonCell(l)).join('')}
          <button class="tt-add small" data-add-day="${d}" data-add-slot="${slot.id}"
            aria-label="这一节再加一门课">＋</button>
        </div>`;
      }
      return `<div class="tt-cell" data-day="${d}" data-slot="${slot.id}">
        <button class="tt-add" data-add-day="${d}" data-add-slot="${slot.id}" aria-label="在这节课加一门课">＋</button>
      </div>`;
    }).join('');
    return `<div class="tt-slot">
        <b>${esc(slot.label)}</b>
        <span>${esc(slot.start)}</span>
      </div>${cells}`;
  }).join('');

  const unplaced = store.state.lessons.filter((l) => !slotForLesson(slots, l));

  const box = document.createElement('div');
  box.className = 'schedule-body';
  box.innerHTML = `
    <div class="week-head">
      <button class="icon-btn" data-week="-1" aria-label="上一周"><svg class="ico"><use href="#i-left"/></svg></button>
      <button class="range" data-act="pickWeek">${range}</button>
      <button class="icon-btn" data-week="1" aria-label="下一周"><svg class="ico"><use href="#i-right"/></svg></button>
      <button class="linkbtn" data-act="students">学生<svg class="ico"><use href="#i-right"/></svg></button>
    </div>
    ${await tipHtml('schedule')}
    <div class="timetable-wrap">
      <div class="timetable">
        <div class="tt-corner"></div>
        ${dates.map((d) => `<div class="tt-day${d === today ? ' today' : ''}" data-day="${d}">
            <span class="d1">${weekdayCN(d)}</span>
            <span class="d2">${fmtMD(d)}</span>
          </div>`).join('')}
        ${gridRows}
      </div>
    </div>

    ${unplaced.length ? `<div class="grouph">其它时间 <span class="cnt">${unplaced.length}</span></div>
      <div class="card tight">
        ${unplaced.slice().sort((a, b) => (a.date + a.start < b.date + b.start ? -1 : 1))
          .map((l) => `<a class="lesson ${l.type === 'small' ? 'small' : 'one'}" href="#/lesson?id=${l.id}">
              <span class="lbar"></span>
              <div class="lmain">
                <div class="ltop"><span class="ltime">${esc(fmtMD(l.date))} ${esc(timeRange(l))}</span>
                  <span class="type">${l.type === 'small' ? '小班' : '一对一'}</span></div>
                <div class="lname">${esc(nameSummary(l))}</div>
                <div class="lsub">${esc(STATUS[l.status]?.label || '未上')}</div>
              </div>
              <span class="dot ${STATUS[l.status]?.cls || ''}"></span>
            </a>`).join('')}
      </div>` : ''}
  `;
  root.replaceChildren(box);
  bind(box, root);
}

/** 网格单元格里的紧凑卡片 */
function lessonCell(l) {
  const kind = l.type === 'small' ? 'small' : 'one';
  return `<a class="lesson cell ${kind}" data-type="${kind}" href="#/lesson?id=${l.id}">
    <span class="lname">${esc(nameSummary(l, 2))}</span>
    <span class="lsub">${esc(STATUS[l.status]?.label || '未上')}</span>
    <span class="dot ${STATUS[l.status]?.cls || ''}"></span>
  </a>`;
}

function bind(box, root) {
  box.addEventListener('click', async (ev) => {
    const week = ev.target.closest('[data-week]');
    if (week) {
      viewAnchor = addDays(viewAnchor, Number(week.dataset.week) * 7);
      await render(root);
      return;
    }
    const act = ev.target.closest('[data-act]')?.dataset.act;
    if (act === 'students') {
      location.hash = '#/students';
      return;
    }
    if (act === 'pickWeek') {
      openWeekPicker(root);
    }
  });

  $('#fab').onclick = () => openLessonForm(root, null, viewDatesDefault());
  $('#btnStu').onclick = () => { location.hash = '#/students'; };

  // 点网格里的空格子 → 直接新建该天该节次的课
  box.addEventListener('click', (ev) => {
    const add = ev.target.closest('[data-add-day]');
    if (!add) return;
    openLessonForm(root, null, add.dataset.addDay, null, add.dataset.addSlot);
  });
}

function viewDatesDefault() {
  const dates = weekDates(viewAnchor || todayStr(), store.state.settings.weekStart === 7 ? 7 : 1);
  const today = todayStr();
  return dates.includes(today) ? today : dates[0];
}

function openWeekPicker(root) {
  const weekStart = store.state.settings.weekStart === 7 ? 7 : 1;
  const dates = weekDates(viewAnchor, weekStart);
  sheet({
    title: '跳到哪一周',
    body: `<div class="sgroup" style="margin:0">
      ${dates.map((d) => `<button class="srow" data-jump="${d}">
        <span class="sl">${weekdayCN(d)} ${fmtMD(d)}</span>
        ${d === todayStr() ? '<span class="sv">今天</span>' : ''}
        <svg class="ico"><use href="#i-right"/></svg></button>`).join('')}
      <button class="srow" data-jump="today"><span class="sl">回到本周</span></button>
    </div>`,
    actions: [{ label: '关闭', onClick: (close) => close() }],
    onMount: (el, close) => {
      el.addEventListener('click', async (ev) => {
        const b = ev.target.closest('[data-jump]');
        if (!b) return;
        viewAnchor = b.dataset.jump === 'today' ? todayStr() : b.dataset.jump;
        close();
        await render(root);
      });
    },
  });
}

/* ---------- 新建 / 编辑课 ---------- */
export function openLessonForm(root, lesson, defaultDate, onSaved, defaultSlotId) {
  const isNew = !lesson;
  const slots = getSlots(store.state.settings);
  const currentSlot = lesson ? slotForLesson(slots, lesson) : slotById(slots, defaultSlotId) || slots[0];
  const draft = {
    type: lesson?.type ?? 'one',
    date: lesson?.date ?? defaultDate ?? todayStr(),
    start: lesson?.start ?? currentSlot?.start ?? '19:00',
    duration: lesson?.duration ?? (currentSlot ? slotDuration(currentSlot) : 90),
    slotId: currentSlot?.id ?? null,
    customTime: !!lesson && !slotForLesson(slots, lesson),
    place: lesson?.place ?? '',
    repeatType: lesson?.repeat?.type ?? 'none',
    weekdays: lesson?.repeat?.weekdays?.length
      ? [...lesson.repeat.weekdays]
      : [((new Date().getDay() + 6) % 7) + 1],
    names: lesson ? (lesson.members || []).map((m) => m.name) : [''],
    members: lesson?.members ?? null,
  };

  const slotOptions = slots.map((s) =>
    `<option value="${esc(s.id)}" ${draft.slotId === s.id && !draft.customTime ? 'selected' : ''}>${
      esc(s.label)} ${esc(s.start)}–${esc(s.end)}</option>`).join('')
    + `<option value="custom" ${draft.customTime ? 'selected' : ''}>自定义时间</option>`;

  const dayChips = ['一', '二', '三', '四', '五', '六', '日'].map((n, i) => {
    const w = i + 1;
    return `<button class="tag ${draft.weekdays.includes(w) ? 'on' : ''}" data-wd="${w}">${n}</button>`;
  }).join('');

  let saveFn = () => {};

  const namesHtml = () => draft.names.map((n, i) => `
    <div style="display:flex;gap:8px;margin-bottom:8px" data-name-row="${i}">
      <input class="input" data-name="${i}" placeholder="学生姓名" value="${esc(n)}" list="studentNames" />
      ${draft.names.length > 1 ? `<button class="btn" data-rmname="${i}" style="flex:0 0 auto">删</button>` : ''}
    </div>`).join('');

  sheet({
    title: isNew ? '新加一节课' : '改一下这节课',
    body: `
      <datalist id="studentNames">
        ${store.state.students.map((s) => `<option value="${esc(s.name)}"></option>`).join('')}
      </datalist>
      <div class="field">
        <label>类型</label>
        <div class="tagset" id="l-type">
          <button class="tag ${draft.type === 'one' ? 'on' : ''}" data-type="one">一对一</button>
          <button class="tag ${draft.type === 'small' ? 'on' : ''}" data-type="small">小班</button>
        </div>
      </div>
      <div class="field">
        <label>学生</label>
        <div id="l-names">${namesHtml()}</div>
        <button class="btn" id="l-addname" style="width:100%">＋ 再加一个学生</button>
      </div>
      <div style="display:flex;gap:10px">
        <div class="field" style="flex:1.3"><label>日期</label>
          <input class="input" id="l-date" type="date" value="${esc(draft.date)}" /></div>
        <div class="field" style="flex:1"><label>第几节</label>
          <select class="input" id="l-slot">${slotOptions}</select></div>
      </div>
      <div style="display:flex;gap:10px;${draft.customTime ? '' : 'display:none'}" id="l-custom-row">
        <div class="field" style="flex:1"><label>开始</label>
          <input class="input" id="l-start" type="time" value="${esc(draft.start)}" /></div>
        <div class="field" style="flex:1"><label>时长（分钟）</label>
          <input class="input" id="l-duration" type="number" min="15" step="15" value="${draft.duration}" /></div>
      </div>
      <div class="field">
        <label>地点（可不填）</label>
        <input class="input" id="l-place" placeholder="教室" value="${esc(draft.place)}" />
      </div>
      <div class="field">
        <label>重复</label>
        <div class="tagset" id="l-repeat">
          <button class="tag ${draft.repeatType === 'none' ? 'on' : ''}" data-rep="none">不重复</button>
          <button class="tag ${draft.repeatType === 'weekly' ? 'on' : ''}" data-rep="weekly">每周</button>
        </div>
        <div class="tagset" id="l-weekdays" style="margin-top:8px;${draft.repeatType === 'weekly' ? '' : 'display:none'}">${dayChips}</div>
      </div>
    `,
    actions: [
      { label: '取消', onClick: (close) => close() },
      { label: '保存', kind: 'blue', onClick: (close) => { close(); saveFn(); } },
    ],
    onMount: (el, close) => {
      const namesBox = $('#l-names', el);
      const readNames = () => [...el.querySelectorAll('[data-name]')].map((i) => i.value.trim());

      // 节次选择：选「自定义时间」才显示开始/时长
      const slotSelect = $('#l-slot', el);
      const customRow = $('#l-custom-row', el);
      slotSelect.addEventListener('change', () => {
        const isCustom = slotSelect.value === 'custom';
        customRow.style.display = isCustom ? '' : 'none';
        draft.customTime = isCustom;
        if (!isCustom) {
          const slot = slotById(slots, slotSelect.value);
          draft.slotId = slot?.id ?? null;
          draft.start = slot?.start ?? draft.start;
          draft.duration = slot ? slotDuration(slot) : draft.duration;
        } else {
          draft.slotId = null;
        }
      });

      $('#l-type', el).addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-type]');
        if (!b) return;
        draft.type = b.dataset.type;
        $('#l-type', el).querySelectorAll('.tag').forEach((x) => x.classList.toggle('on', x === b));
        if (draft.type === 'one') {
          draft.names = [readNames()[0] || ''];
          namesBox.innerHTML = namesHtml();
          $('#l-addname', el).style.display = 'none';
        } else {
          $('#l-addname', el).style.display = '';
        }
      });

      $('#l-addname', el).addEventListener('click', () => {
        draft.names = [...readNames(), ''];
        if (draft.type === 'one') {
          draft.type = 'small';
          $('#l-type', el).querySelectorAll('.tag').forEach((x) =>
            x.classList.toggle('on', x.dataset.type === 'small'));
        }
        namesBox.innerHTML = namesHtml();
        el.querySelector(`[data-name="${draft.names.length - 1}"]`)?.focus();
      });

      namesBox.addEventListener('click', (ev) => {
        const rm = ev.target.closest('[data-rmname]');
        if (!rm) return;
        const idx = Number(rm.dataset.rmname);
        draft.names = readNames().filter((_, i) => i !== idx);
        namesBox.innerHTML = namesHtml();
      });

      $('#l-repeat', el).addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-rep]');
        if (!b) return;
        draft.repeatType = b.dataset.rep;
        $('#l-repeat', el).querySelectorAll('.tag').forEach((x) => x.classList.toggle('on', x === b));
        $('#l-weekdays', el).style.display = draft.repeatType === 'weekly' ? '' : 'none';
      });
      $('#l-weekdays', el).addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-wd]');
        if (!b) return;
        const w = Number(b.dataset.wd);
        const set = new Set(draft.weekdays);
        if (set.has(w)) set.delete(w); else set.add(w);
        draft.weekdays = [...set].sort((a, b2) => a - b2);
        b.classList.toggle('on');
      });

      saveFn = async () => {
        const names = readNames().filter(Boolean);
        if (!names.length) { toast('先填学生姓名'); return; }
        const date = $('#l-date', el).value || todayStr();
        const members = [];
        for (const name of names) {
          const stu = await ensureStudent(name);
          const prev = draft.members?.find((m) => m.name === name);
          members.push({
            studentId: stu.id,
            name,
            state: prev?.state ?? null,
            note: prev?.note ?? '',
            attendance: prev?.attendance ?? 'todo',
          });
        }
        const chosenSlot = draft.customTime ? null : slotById(slots, slotSelect.value);
        const rec = {
          id: lesson?.id ?? uid(),
          date,
          start: chosenSlot ? chosenSlot.start : ($('#l-start', el).value || '19:00'),
          duration: chosenSlot ? slotDuration(chosenSlot) : (Number($('#l-duration', el).value) || 90),
          slotId: chosenSlot ? chosenSlot.id : null,
          type: members.length > 1 ? 'small' : (draft.type === 'small' ? 'small' : 'one'),
          place: $('#l-place', el).value.trim(),
          status: lesson?.status ?? 'todo',
          content: lesson?.content ?? '',
          homework: lesson?.homework ?? '',
          repeat: {
            type: draft.repeatType,
            weekdays: draft.repeatType === 'weekly' ? draft.weekdays : [],
            sourceId: lesson?.repeat?.sourceId ?? null,
          },
          members,
          createdAt: lesson?.createdAt ?? Date.now(),
        };
        if (rec.repeat.type === 'weekly' && !rec.repeat.weekdays.length) {
          toast('每周重复要选星期几');
          return;
        }
        await store.saveRecord('lessons', rec);
        toast(isNew ? '课加好了' : '已保存');
        onSaved?.(rec);
        await render(root);
      };
    },
  });
}

export function reset() {
  viewAnchor = null;
}

export function title() { return '教培课表'; }

export function subtitle() {
  const n = store.state.lessons.length;
  return n ? `${n} 节课` : '';
}

void confirmBox; void emptyState;
