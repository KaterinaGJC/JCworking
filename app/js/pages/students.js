// 学生列表
import * as store from '../store.js';
import { esc, } from '../util.js';
import { countDoneFor } from './schedule.js';

export async function render(root) {
  const students = [...store.state.students].sort((a, b) => {
    const ca = countDoneFor(a.id);
    const cb = countDoneFor(b.id);
    if (cb !== ca) return cb - ca;
    return a.name.localeCompare(b.name, 'zh');
  });

  const box = document.createElement('div');
  box.className = 'students-body';
  box.innerHTML = students.length
    ? `<div class="card tight">
        ${students.map((s) => `<a class="stu-item" href="#/student?id=${s.id}">
          <span class="avatar">${esc(s.name.slice(0, 1))}</span>
          <span class="t">${esc(s.name)}</span>
          <span class="c">已上 ${countDoneFor(s.id)} 节</span>
          <svg class="ico" style="width:16px;height:16px;color:var(--text3)"><use href="#i-right"/></svg>
        </a>`).join('')}
      </div>`
    : `<div class="empty">还没有学生<br /><span class="small">在课表里新建一节课，填上姓名就会自动记进来</span></div>`;
  root.replaceChildren(box);
}

export function title() { return '学生'; }

export function subtitle() {
  return `${store.state.students.length} 人`;
}

void store;
