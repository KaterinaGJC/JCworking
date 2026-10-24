// 学生档案：该生全部历史课次
import * as store from '../store.js';
import { esc, fmtMD, weekdayCN } from '../util.js';
import { lessonsOf, countDoneFor, STATUS } from './schedule.js';

const STATE_LABEL = { great: '很好', ok: '正常', need: '需加强', watch: '待观察' };

function memberOf(lesson, studentId) {
  return (lesson.members || []).find((m) => m.studentId === studentId) || null;
}

export async function render(root, ctx = {}) {
  const id = ctx.params?.id;
  const student = store.state.students.find((s) => s.id === id);
  if (!student) {
    root.innerHTML = '<div class="empty">这名学生找不到了</div>';
    return;
  }

  const list = lessonsOf(id);
  const last = list[0];
  const lastState = last ? memberOf(last, id)?.state : null;
  const doneCount = countDoneFor(id);

  const box = document.createElement('div');
  box.className = 'student-body';
  box.innerHTML = `
    <div class="statrow">
      <div class="stat"><div class="n">${doneCount}</div><div class="l">累计已上</div></div>
      <div class="stat"><div class="n">${last ? fmtMD(last.date) : '—'}</div><div class="l">最近一次</div></div>
      <div class="stat"><div class="n">${lastState ? STATE_LABEL[lastState] : '—'}</div><div class="l">最近状态</div></div>
    </div>
    ${list.length ? list.map((l) => {
      const m = memberOf(l, id);
      return `<a class="history" href="#/lesson?id=${l.id}">
        <div class="h1">
          <span>${fmtMD(l.date)} ${weekdayCN(l.date)}</span>
          <span class="sep">·</span>
          <span>${l.type === 'small' ? '小班' : '一对一'}</span>
          <span class="badge ${l.status === 'done' ? 'teal' : l.status === 'leave' ? 'amber' : ''}"
            style="margin-left:auto">${STATUS[l.status]?.label || '未上'}</span>
        </div>
        ${l.content ? `<div class="h2"><b>内容</b>${esc(l.content)}</div>`
          : '<div class="h2 muted" style="font-size:13px">内容还没写</div>'}
        ${l.homework ? `<div class="h3"><b>作业</b>${esc(l.homework)}</div>` : ''}
        ${m?.state ? `<div class="h3" style="margin-top:6px"><b>状态</b>${STATE_LABEL[m.state]}${
          m.note ? ' · ' + esc(m.note) : ''}</div>` : ''}
      </a>`;
    }).join('') : '<div class="empty">还没有上过课</div>'}
  `;
  root.replaceChildren(box);
}

export function title() {
  const m = location.hash.match(/id=([^&]+)/);
  if (!m) return '学生档案';
  const s = store.state.students.find((x) => x.id === decodeURIComponent(m[1]));
  return s ? s.name : '学生档案';
}

export function subtitle() {
  const m = location.hash.match(/id=([^&]+)/);
  if (!m) return '';
  return `累计 ${countDoneFor(decodeURIComponent(m[1]))} 节`;
}
