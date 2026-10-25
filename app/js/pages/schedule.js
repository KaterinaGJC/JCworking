// 教培课表：周视图 + 新建课 + 重复课惰性生成
import * as store from '../store.js';
import { shouldGenerate } from '../core/repeat.js';
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
    ${dates.map((d) => {
      const list = store.state.lessons
        .filter((l) => l.date === d)
        .sort((a, b) => (a.start < b.start ? -1 : 1));
      const isToday = d === today;
      return `<div class="daygroup">
        <div class="dhead">
          <span class="dn">${weekdayCN(d)}</span>
          <span class="dd">${fmtMD(d)}</span>
          ${isToday ? '<span class="tn">今天</span>' : ''}
        </div>
        ${list.length ? list.map((l) => `
          <a class="lesson ${l.type === 'small' ? 'small' : 'one'}" href="#/lesson?id=${l.id}">
            <span class="lbar"></span>
            <div class="lmain">
              <div class="ltop">
                <span class="ltime">${esc(timeRange(l))}</span>
                <span class="type">${l.type === 'small' ? '小班' : '一对一'}</span>
              </div>
              <div class="lname">${esc(nameSummary(l))}</div>
              <div class="lsub">${esc(STATUS[l.status]?.label || '未上')}${
                l.content ? ' · ' + esc(l.content.slice(0, 14)) : ''}</div>
            </div>
            <span class="dot ${STATUS[l.status]?.cls || ''}"></span>
          </a>`).join('')
        : '<div class="none">没有课</div>'}
      </div>`;
    }).join('')}
  `;
  root.replaceChildren(box);
  bind(box, root);
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
export function openLessonForm(root, lesson, defaultDate, onSaved) {
  const isNew = !lesson;
  const draft = {
    type: lesson?.type ?? 'one',
    date: lesson?.date ?? defaultDate ?? todayStr(),
    start: lesson?.start ?? '19:00',
    duration: lesson?.duration ?? 90,
    place: lesson?.place ?? '',
    repeatType: lesson?.repeat?.type ?? 'none',
    weekdays: lesson?.repeat?.weekdays?.length
      ? [...lesson.repeat.weekdays]
      : [((new Date().getDay() + 6) % 7) + 1],
    names: lesson ? (lesson.members || []).map((m) => m.name) : [''],
    members: lesson?.members ?? null,
  };

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
        <div class="field" style="flex:1"><label>开始</label>
          <input class="input" id="l-start" type="time" value="${esc(draft.start)}" /></div>
      </div>
      <div style="display:flex;gap:10px">
        <div class="field" style="flex:1"><label>时长（分钟）</label>
          <input class="input" id="l-duration" type="number" min="15" step="15" value="${draft.duration}" /></div>
        <div class="field" style="flex:1"><label>地点（可不填）</label>
          <input class="input" id="l-place" placeholder="教室" value="${esc(draft.place)}" /></div>
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
        const rec = {
          id: lesson?.id ?? uid(),
          date,
          start: $('#l-start', el).value || '19:00',
          duration: Number($('#l-duration', el).value) || 90,
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
