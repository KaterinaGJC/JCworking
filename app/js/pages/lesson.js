// 课次详情：整节课记录（内容/作业）+ 每个学生的学习状态与考勤
import * as store from '../store.js';
import {
  $, esc, fmtFullCN, endTimeHM, bindAutoSave, vibrate,
} from '../util.js';
import { sheet, toast, confirmBox } from '../ui.js';
import { STATUS, ensureStudent, renameStudent } from './schedule.js';

const STATE_TAGS = [
  ['great', '很好', ''],
  ['ok', '正常', ''],
  ['need', '需加强', 'warn'],
  ['watch', '待观察', ''],
];

export async function render(root, ctx = {}) {
  const id = ctx.params?.id;
  let lesson = store.state.lessons.find((l) => l.id === id);
  if (!lesson) {
    root.innerHTML = '<div class="empty">这节课找不到了，可能已经被删掉</div>';
    return;
  }

  /**
   * 所有写入都基于"库里最新的那份"再叠加改动，
   * 避免"内容自动保存"和"点状态"两次写入互相覆盖。
   */
  const patch = async (partial) => {
    const base = store.state.lessons.find((l) => l.id === id) || lesson;
    const next = { ...base, ...partial };
    lesson = next;
    await store.saveRecord('lessons', next);
    return next;
  };

  const box = document.createElement('div');
  box.className = 'lesson-body';
  box.innerHTML = `
    <div class="dhead-big">
      <div class="d1">${fmtFullCN(lesson.date)} · ${esc(lesson.start)}–${esc(endTimeHM(lesson.start, lesson.duration))}</div>
      <div class="d2">
        <span class="badge ${lesson.type === 'small' ? 'purple' : 'teal'}">
          ${lesson.type === 'small' ? '小班' : '一对一'}</span>
        <button class="selectish" id="l-status">${STATUS[lesson.status]?.label || '未上'}
          <svg class="ico"><use href="#i-down"/></svg></button>
        <button class="selectish" id="l-time">改时间<svg class="ico"><use href="#i-right"/></svg></button>
        ${lesson.place ? `<span class="badge">${esc(lesson.place)}</span>` : ''}
      </div>
    </div>

    <div class="field">
      <label>学生 · ${(lesson.members || []).length} 人</label>
      <div class="card" style="padding:14px" id="members">
        ${(lesson.members || []).map((m, i) => memberHtml(m, i, lesson)).join('')}
        <button class="btn" id="addMember" style="width:100%;margin-top:12px">＋ 加一个学生</button>
      </div>
    </div>

    <div class="field">
      <label>本节课主要内容</label>
      <textarea class="textarea autogrow" id="l-content" rows="3"
        placeholder="这节课讲了什么…">${esc(lesson.content || '')}</textarea>
    </div>

    <div class="field">
      <label>布置的作业</label>
      <textarea class="textarea autogrow" id="l-homework" rows="2"
        placeholder="留了什么作业…">${esc(lesson.homework || '')}</textarea>
    </div>

    <button class="bigbtn" id="markDone">${lesson.status === 'done' ? '已上课 ✓' : '标记已上课'}</button>
    <button class="bigbtn ghost" id="markLeave">${lesson.status === 'leave' ? '已请假' : '这节课请假了'}</button>
    <button class="btn danger" id="delLesson" style="width:100%;margin-top:10px">删除这节课</button>
  `;
  root.replaceChildren(box);

  // 正文自动保存（中文输入法期间不写）
  bindAutoSave($('#l-content', box), (v) => patch({ content: v }).then(() => toast('已保存')));
  bindAutoSave($('#l-homework', box), (v) => patch({ homework: v }).then(() => toast('已保存')));

  // 自适应高度
  box.querySelectorAll('textarea').forEach((ta) => {
    const fit = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 340) + 'px'; };
    ta.style.overflow = 'hidden';
    ta.addEventListener('input', fit);
    fit();
  });

  // 课次状态
  $('#l-status', box).addEventListener('click', () => {
    pickStatus('这节课的状态', lesson.status, async (v) => {
      await patch({ status: v });
      await rerender(root, id);
    });
  });

  // 改时间
  $('#l-time', box).addEventListener('click', () => openTimeSheet(root, lesson));

  // 学生状态 / 考勤 / 移出
  box.addEventListener('click', async (ev) => {
    const st = ev.target.closest('[data-state]');
    if (st) {
      const i = Number(st.dataset.stateIndex);
      const members = readMembers(id, lesson);
      const was = members[i].state;
      members[i] = { ...members[i], state: was === st.dataset.state ? null : st.dataset.state };
      await patch({ members });
      await rerender(root, id);
      return;
    }

    const att = ev.target.closest('[data-att]');
    if (att) {
      const i = Number(att.dataset.attIndex);
      const members = readMembers(id, lesson);
      members[i] = { ...members[i], attendance: att.dataset.att };
      await patch({ members });
      await rerender(root, id);
      return;
    }

    const rm = ev.target.closest('[data-rmmember]');
    if (rm) {
      const i = Number(rm.dataset.rmmember);
      const members = readMembers(id, lesson);
      const m = members[i];
      const yes = await confirmBox({
        title: '把这名学生从这节课移出？',
        desc: esc(m.name),
        okText: '移出',
        danger: true,
      });
      if (!yes) return;
      const next = members.filter((_, idx) => idx !== i);
      await patch({ members: next, type: next.length > 1 ? 'small' : lesson.type });
      await rerender(root, id);
    }
  });

  // 备注：失焦保存
  box.addEventListener('focusout', async (ev) => {
    const note = ev.target.closest?.('[data-note]');
    if (!note) return;
    const i = Number(note.dataset.note);
    const members = readMembers(id, lesson);
    if (members[i].note === note.value.trim()) return;
    members[i] = { ...members[i], note: note.value.trim() };
    await patch({ members });
    toast('已保存');
  });

  // 改名
  box.addEventListener('change', async (ev) => {
    const nameEl = ev.target.closest?.('[data-name]');
    if (!nameEl) return;
    const i = Number(nameEl.dataset.name);
    const newName = nameEl.value.trim();
    const members = readMembers(id, lesson);
    const member = members[i];
    if (!newName || newName === member.name) { nameEl.value = member.name; return; }

    const exists = store.state.students.find((s) => s.name === newName);
    if (exists && exists.id !== member.studentId) {
      members[i] = { ...member, studentId: exists.id, name: newName };
    } else {
      await renameStudent(member.studentId, newName, member.name);
      members[i] = { ...member, name: newName };
    }
    await patch({ members });
    toast('姓名已更新');
    await rerender(root, id);
  });

  // 加学生
  $('#addMember', box).addEventListener('click', () => {
    if (box.querySelector('#newMemberInput')) return;
    const wrap = document.createElement('div');
    wrap.style.marginTop = '10px';
    wrap.innerHTML = '<input class="input" id="newMemberInput" placeholder="新学生姓名，回车加入" />';
    $('#members', box).insertBefore(wrap, $('#addMember', box));
    const input = $('#newMemberInput', box);
    input.focus();
    input.addEventListener('keydown', async (ev) => {
      if (ev.key !== 'Enter') return;
      const name = input.value.trim();
      if (!name) return;
      const stu = await ensureStudent(name);
      const members = readMembers(id, lesson);
      members.push({ studentId: stu.id, name, state: null, note: '', attendance: 'todo' });
      await patch({ members, type: 'small' });
      toast('加好了');
      await rerender(root, id);
    });
  });

  // 标记已上课
  $('#markDone', box).addEventListener('click', async () => {
    const members = readMembers(id, lesson).map((m) => ({
      ...m,
      attendance: m.attendance === 'leave' ? 'leave' : 'done',
    }));
    await patch({ status: 'done', members });
    vibrate(18);
    toast('已标记为上课');
    await rerender(root, id);
  });

  // 请假
  $('#markLeave', box).addEventListener('click', async () => {
    const next = lesson.status === 'leave' ? 'todo' : 'leave';
    await patch({ status: next });
    toast(next === 'leave' ? '已标记请假' : '已取消请假');
    await rerender(root, id);
  });

  // 删除
  $('#delLesson', box).addEventListener('click', async () => {
    const yes = await confirmBox({
      title: '删掉这节课？',
      desc: `${esc(fmtFullCN(lesson.date))} · ${esc(lesson.start)}<br />删掉之后学生档案里也不会再有这节课。`,
      okText: '删除',
      danger: true,
    });
    if (!yes) return;
    const snapshot = { ...lesson };
    await store.removeRecord('lessons', snapshot.id);
    location.hash = '#/schedule';
    toast('已删除', {
      actionLabel: '撤销',
      onAction: async () => {
        await store.saveRecord('lessons', snapshot);
        location.hash = '#/schedule';
      },
    });
  });
}

/** 永远基于库里最新的那份成员数组来改 */
function readMembers(id, fallback) {
  const cur = store.state.lessons.find((l) => l.id === id) || fallback;
  return (cur.members || []).map((m) => ({ ...m }));
}

function memberHtml(m, i, lesson) {
  return `<div class="member-block" data-member="${i}">
    <div class="sturow">
      <input class="input plain" data-name="${i}" value="${esc(m.name)}"
        style="font-size:15.5px;font-weight:600;background:transparent;border:0;padding:0" />
      ${(lesson.members || []).length > 1
        ? `<button class="btn" data-rmmember="${i}" style="padding:4px 9px;font-size:12px">移出</button>` : ''}
    </div>
    <div class="tagset" style="margin-top:10px">
      ${STATE_TAGS.map(([k, l, cls]) =>
        `<button class="tag ${m.state === k ? 'on ' + cls : ''}" data-state="${k}" data-state-index="${i}">${l}</button>`).join('')}
    </div>
    <div class="tagset" style="margin-top:8px">
      <span class="small muted" style="align-self:center;margin-right:2px">考勤</span>
      ${Object.entries(STATUS).map(([k, v]) =>
        `<button class="tag ${m.attendance === k ? 'on' : ''}" data-att="${k}" data-att-index="${i}">${v.label}</button>`).join('')}
    </div>
    <textarea class="textarea plain" data-note="${i}" rows="2" style="margin-top:10px"
      placeholder="这个学生今天的状态，想记就记…">${esc(m.note || '')}</textarea>
  </div>`;
}

function pickStatus(title, current, onPick) {
  sheet({
    title,
    body: `<div class="sgroup" style="margin:0">
      ${Object.entries(STATUS).map(([k, v]) => `<button class="srow" data-pick="${k}">
        <span class="sl">${v.label}</span>
        ${current === k ? '<span class="sv">当前</span>' : ''}
        </button>`).join('')}
    </div>`,
    actions: [{ label: '取消', onClick: (close) => close() }],
    onMount: (el, close) => {
      el.addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-pick]');
        if (!b) return;
        close();
        onPick(b.dataset.pick);
      });
    },
  });
}

function openTimeSheet(root, lesson) {
  let saveFn = () => {};
  sheet({
    title: '改上课时间',
    body: `
      <div class="field"><label>日期</label>
        <input class="input" id="t-date" type="date" value="${esc(lesson.date)}" /></div>
      <div style="display:flex;gap:10px">
        <div class="field" style="flex:1"><label>开始</label>
          <input class="input" id="t-start" type="time" value="${esc(lesson.start)}" /></div>
        <div class="field" style="flex:1"><label>时长（分钟）</label>
          <input class="input" id="t-dur" type="number" step="15" min="15" value="${lesson.duration || 90}" /></div>
      </div>
    `,
    actions: [
      { label: '取消', onClick: (close) => close() },
      { label: '保存', kind: 'blue', onClick: (close) => { close(); saveFn(); } },
    ],
    onMount: (el) => {
      saveFn = async () => {
        const base = store.state.lessons.find((l) => l.id === lesson.id) || lesson;
        await store.saveRecord('lessons', {
          ...base,
          date: $('#t-date', el).value || base.date,
          start: $('#t-start', el).value || base.start,
          duration: Number($('#t-dur', el).value) || 90,
        });
        toast('时间已改');
        await rerender(root, lesson.id);
      };
    },
  });
}

async function rerender(root, id) {
  await render(root, { params: { id } });
}

export function title() {
  const l = currentLesson();
  return l ? fmtFullCN(l.date) : '课次详情';
}

export function subtitle() {
  const l = currentLesson();
  return l ? `${l.start}–${endTimeHM(l.start, l.duration)}` : '';
}

function currentLesson() {
  const m = location.hash.match(/id=([^&]+)/);
  if (!m) return null;
  return store.state.lessons.find((l) => l.id === decodeURIComponent(m[1])) ?? null;
}
