// 游戏娱乐：游戏库 / 活动 / 追更 / 体验记录
import * as store from '../store.js';
import { $, esc, uid, todayStr, diffDays, weekdayIndex1, relativeCN, fmtMD } from '../util.js';
import { sheet, confirmBox, toast, emptyState, starsHtml } from '../ui.js';
import { tipHtml } from '../tips.js';

let tab = 'lib';

const PLATFORMS = ['PC', '手机', '主机', 'Switch', '其他'];
const TYPES = [['game', '游戏'], ['movie', '电影'], ['tv', '剧'], ['anime', '番']];
const WEEK_CN = ['', '一', '二', '三', '四', '五', '六', '日'];
const typeLabel = (t) => (TYPES.find(([k]) => k === t) || [, '其他'])[1];

/* ---------------- 游戏库 ---------------- */
const GAME_GROUPS = [
  ['playing', '在玩'],
  ['wish', '想玩'],
  ['cleared', '已通关'],
];

function gamesPanel() {
  const all = store.state.games;
  if (!all.length) {
    return emptyState({ text: '游戏库还是空的', actionLabel: '加一款游戏', extra: '' });
  }
  return GAME_GROUPS.map(([status, label]) => {
    const rows = all.filter((g) => g.status === status);
    if (!rows.length) return '';
    return `<div class="grouph">${label} <span class="cnt">${rows.length}</span></div>
      ${rows.map((g) => `
        <div class="gcard" data-game="${g.id}">
          <div class="gt">
            <span class="gn">${esc(g.name)}</span>
            ${g.platform ? `<span class="badge blue">${esc(g.platform)}</span>` : ''}
          </div>
          <div class="gd">${g.rating ? starsHtml(g.rating) + ' · ' : ''}${esc(g.note || '')}</div>
          <div class="ga">
            ${status === 'wish' ? `<button class="btn primary" data-move="${g.id}" data-to="playing">开始玩</button>` : ''}
            ${status === 'playing' ? `<button class="btn primary" data-move="${g.id}" data-to="cleared">通关了</button>` : ''}
            ${status === 'cleared' ? `<button class="btn" data-move="${g.id}" data-to="playing">改回在玩</button>` : ''}
            <button class="btn" data-edit-game="${g.id}">编辑</button>
            <button class="btn" data-exp-from="${g.id}">写体验</button>
          </div>
        </div>`).join('')}`;
  }).join('');
}

/* ---------------- 活动 ---------------- */
function activityRows() {
  const today = todayStr();
  const all = store.state.activities.filter((a) => !a.done);
  const due = all.filter((a) => {
    const n = diffDays(a.due, today);
    return n >= 0 && n <= 3;
  }).sort((a, b) => (a.due < b.due ? -1 : 1));
  const ongoing = all.filter((a) => diffDays(a.due, today) > 3)
    .sort((a, b) => (a.due < b.due ? -1 : 1));
  const finished = all.filter((a) => diffDays(a.due, today) < 0)
    .sort((a, b) => (a.due > b.due ? -1 : 1));
  const doneList = store.state.activities.filter((a) => a.done);

  const card = (a) => {
    const n = diffDays(a.due, today);
    const cls = a.done || n < 0 ? 'over' : (n <= 1 ? 'urgent' : '');
    const text = a.done ? '已完成' : (n < 0 ? '已结束' : (n === 0 ? '今天截止' : `还剩 ${n} 天`));
    return `<div class="acard" data-act-id="${a.id}">
      <div class="amain">
        <div class="an">${esc(a.title)}</div>
        <div class="ag">${esc(a.game || '')}${a.due ? ' · ' + fmtMD(a.due) + ' 截止' : ''}</div>
      </div>
      <div class="countdown ${cls}">${text}</div>
      <button class="btn" data-finish-act="${a.id}" style="padding:5px 9px;font-size:12px">${a.done ? '恢复' : '完成'}</button>
    </div>`;
  };

  const sections = [];
  if (due.length) sections.push(`<div class="grouph">即将到期 <span class="cnt">${due.length}</span></div>${due.map(card).join('')}`);
  if (ongoing.length) sections.push(`<div class="grouph">进行中 <span class="cnt">${ongoing.length}</span></div>${ongoing.map(card).join('')}`);
  if (finished.length) sections.push(`<div class="grouph">已结束 <span class="cnt">${finished.length}</span></div>${finished.map(card).join('')}`);
  if (doneList.length) sections.push(`<div class="grouph">已标记完成 <span class="cnt">${doneList.length}</span></div>${doneList.map(card).join('')}`);
  return sections.length ? sections.join('') : emptyState({ text: '没有正在进行或即将到期的活动', actionLabel: '加一个活动' });
}

/* ---------------- 追更 ---------------- */
function watchRows() {
  const all = store.state.shows;
  if (!all.length) return emptyState({ text: '还没有在追的番', actionLabel: '加一部' });
  const todayW = weekdayIndex1(todayStr());
  const finished = (s) => s.total && s.current >= s.total;
  const active = all.filter((s) => !finished(s)).sort((a, b) => {
    const da = a.weekday === todayW ? -1 : ((a.weekday - todayW + 7) % 7);
    const db = b.weekday === todayW ? -1 : ((b.weekday - todayW + 7) % 7);
    return da - db;
  });
  const doneList = all.filter(finished);

  const row = (s) => `<div class="trow" data-show="${s.id}">
      <div class="tmain">
        <div class="tn">${esc(s.name)}
          ${s.weekday === todayW && !finished(s) ? '<span class="today-mark">今天</span>' : ''}
        </div>
        <div class="td">${s.weekday ? `每周${WEEK_CN[s.weekday]}更新 · ` : ''}看到第 ${s.current || 0} 集${
          s.total ? ` / 共 ${s.total}` : ''}</div>
      </div>
      ${finished(s) ? '' : `<button class="plusep" data-plus="${s.id}">+1 集</button>`}
      <button class="btn" data-edit-show="${s.id}" style="padding:6px 8px;font-size:12px">改</button>
    </div>`;

  const html = [];
  if (active.length) html.push(`<div class="card tight">${active.map(row).join('')}</div>`);
  if (doneList.length) {
    html.push(`<div class="grouph">已看完 <span class="cnt">${doneList.length}</span></div>
      <div class="card tight">${doneList.map(row).join('')}</div>`);
  }
  return html.join('');
}

/* ---------------- 体验 ---------------- */
function expRows() {
  const all = [...store.state.experiences].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  if (!all.length) return emptyState({ text: '还没有写过的体验', actionLabel: '写一条' });
  return all.map((e) => `<div class="ecard" data-exp="${e.id}">
      <div class="eh">
        <span class="en">${esc(e.title)}</span>
        <span class="badge purple">${esc(typeLabel(e.type))}</span>
      </div>
      <div class="eb">${esc(e.body || '')}</div>
      <div class="ef">
        ${e.rating ? starsHtml(e.rating) : ''}
        <span>${esc(e.date || '')}</span>
        ${e.progress ? `<span>·</span><span>${esc(e.progress)}</span>` : ''}
      </div>
    </div>`).join('');
}

/* ---------------- 页面 ---------------- */
export async function render(root) {
  const tabs = [['lib', '游戏库'], ['act', '活动'], ['watch', '追更'], ['exp', '体验']];
  const box = document.createElement('div');
  box.className = 'fun-body';
  box.innerHTML = `
    <div class="seg" id="funSeg">
      ${tabs.map(([k, l]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}
    </div>
    ${await tipHtml('fun')}
    <div id="funPanel">
      ${tab === 'lib' ? gamesPanel() : tab === 'act' ? activityRows() : tab === 'watch' ? watchRows() : expRows()}
    </div>
  `;
  root.replaceChildren(box);
  bind(box, root);
}

function bind(box, root) {
  $('#funSeg', box).addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-tab]');
    if (!b || b.dataset.tab === tab) return;
    tab = b.dataset.tab;
    await render(root);
  });

  // FAB 与顶栏＋都按当前分区新增
  const addOne = () => {
    if (tab === 'lib') openGameForm(root, null);
    else if (tab === 'act') openActivityForm(root, null);
    else if (tab === 'watch') openShowForm(root, null);
    else openExperienceEditor(root, null);
  };
  $('#fab').onclick = addOne;
  const plusBtn = $('#btnPlus');
  if (plusBtn) plusBtn.onclick = addOne;

  box.addEventListener('click', async (ev) => {
    const t = ev.target;

    const emptyAct = t.closest('[data-empty-act]');
    if (emptyAct) { $('#fab').click(); return; }

    const move = t.closest('[data-move]');
    if (move) {
      const g = store.state.games.find((x) => x.id === move.dataset.move);
      if (g) {
        await store.saveRecord('games', { ...g, status: move.dataset.to });
        toast(move.dataset.to === 'cleared' ? '已归到「已通关」' : '状态已更新');
        await render(root);
      }
      return;
    }

    const eg = t.closest('[data-edit-game]');
    if (eg) { openGameForm(root, store.state.games.find((x) => x.id === eg.dataset.editGame)); return; }

    const ef = t.closest('[data-exp-from]');
    if (ef) {
      const g = store.state.games.find((x) => x.id === ef.dataset.expFrom);
      openExperienceEditor(root, null, { title: g?.name || '', type: 'game' });
      return;
    }

    const fa = t.closest('[data-finish-act]');
    if (fa) {
      const a = store.state.activities.find((x) => x.id === fa.dataset.finishAct);
      if (a) {
        await store.saveRecord('activities', { ...a, done: !a.done });
        await render(root);
      }
      return;
    }

    const act = t.closest('[data-act-id]');
    if (act && !t.closest('button')) {
      const a = store.state.activities.find((x) => x.id === act.dataset.actId);
      if (a) openActivityForm(root, a);
      return;
    }

    const plus = t.closest('[data-plus]');
    if (plus) {
      const s = store.state.shows.find((x) => x.id === plus.dataset.plus);
      if (s) {
        await store.saveRecord('shows', { ...s, current: (s.current || 0) + 1 });
        await render(root);
      }
      return;
    }

    const es = t.closest('[data-edit-show]');
    if (es) { openShowForm(root, store.state.shows.find((x) => x.id === es.dataset.editShow)); return; }

    const ex = t.closest('[data-exp]');
    if (ex) {
      openExperienceEditor(root, store.state.experiences.find((x) => x.id === ex.dataset.exp));
    }
  });
}

/* ---------------- 表单：游戏 ---------------- */
function openGameForm(root, game) {
  const isNew = !game;
  const draft = {
    name: game?.name ?? '',
    platform: game?.platform ?? 'PC',
    status: game?.status ?? 'playing',
    rating: game?.rating ?? 0,
    note: game?.note ?? '',
  };
  let saveFn = () => {};

  sheet({
    title: isNew ? '加一款游戏' : '改一下',
    body: `
      <input class="input" id="g-name" placeholder="游戏名" value="${esc(draft.name)}" />
      <div class="field" style="margin-top:12px"><label>平台</label>
        <div class="tagset" id="g-platform">${PLATFORMS.map((p) =>
          `<button class="tag ${draft.platform === p ? 'on' : ''}" data-p="${esc(p)}">${esc(p)}</button>`).join('')}</div>
      </div>
      <div class="field"><label>状态</label>
        <div class="tagset" id="g-status">${GAME_GROUPS.map(([k, l]) =>
          `<button class="tag ${draft.status === k ? 'on' : ''}" data-s="${k}">${l}</button>`).join('')}</div>
      </div>
      <div class="field"><label>评分</label>
        <div class="tagset" id="g-rating">${[1, 2, 3, 4, 5].map((i) =>
          `<button class="tag ${draft.rating >= i ? 'on' : ''}" data-r="${i}">${'★'.repeat(i)}</button>`).join('')}</div>
      </div>
      <div class="field"><label>备注</label>
        <textarea class="textarea" id="g-note" rows="2" placeholder="进度、想说的话">${esc(draft.note)}</textarea>
      </div>
      ${isNew ? '' : '<button class="btn danger" id="g-del" style="width:100%">删掉这款游戏</button>'}
    `,
    actions: [
      { label: '取消', onClick: (close) => close() },
      { label: '保存', kind: 'blue', onClick: (close) => { close(); saveFn(); } },
    ],
    onMount: (el, close) => {
      const nameEl = $('#g-name', el);
      nameEl.focus();
      const pick = (sel, key, attr) => {
        $(sel, el).addEventListener('click', (ev) => {
          const b = ev.target.closest(`[${attr}]`);
          if (!b) return;
          draft[key] = b.getAttribute(attr);
          if (key === 'rating') draft.rating = Number(b.getAttribute(attr));
          $(sel, el).querySelectorAll('.tag').forEach((x) => {
            if (key === 'rating') {
              x.classList.toggle('on', Number(x.getAttribute(attr)) <= Number(draft.rating) && Number(draft.rating) > 0);
            } else {
              x.classList.toggle('on', x === b);
            }
          });
        });
      };
      pick('#g-platform', 'platform', 'data-p');
      pick('#g-status', 'status', 'data-s');
      pick('#g-rating', 'rating', 'data-r');

      $('#g-del', el)?.addEventListener('click', async () => {
        close();
        await removeGame(root, game);
      });

      saveFn = async () => {
        const name = nameEl.value.trim();
        if (!name) { toast('先写游戏名'); return; }
        await store.saveRecord('games', {
          id: game?.id ?? uid(),
          name,
          platform: draft.platform,
          status: draft.status,
          rating: Number(draft.rating) || 0,
          note: $('#g-note', el).value.trim(),
          updatedAt: Date.now(),
        });
        toast(isNew ? '加好了' : '已保存');
        await render(root);
      };
    },
  });
}

async function removeGame(root, game) {
  const yes = await confirmBox({ title: '删掉这款游戏？', desc: esc(game.name), okText: '删除', danger: true });
  if (!yes) return;
  await store.removeRecord('games', game.id);
  await render(root);
  toast('已删除', {
    actionLabel: '撤销',
    onAction: async () => { await store.saveRecord('games', game); await render(root); },
  });
}

/* ---------------- 表单：活动 ---------------- */
function openActivityForm(root, act) {
  const isNew = !act;
  let saveFn = () => {};
  const due = act?.due ?? todayStr();

  sheet({
    title: isNew ? '加一个活动' : '改一个活动',
    body: `
      <input class="input" id="a-title" placeholder="活动名" value="${esc(act?.title ?? '')}" />
      <div class="field" style="margin-top:12px"><label>哪个游戏</label>
        <input class="input" id="a-game" placeholder="游戏名（可不填）" value="${esc(act?.game ?? '')}" />
      </div>
      <div class="field"><label>截止日期</label>
        <input class="input" id="a-due" type="date" value="${esc(due)}" />
      </div>
      <div class="field"><label>备注</label>
        <textarea class="textarea" id="a-note" rows="2">${esc(act?.note ?? '')}</textarea>
      </div>
      ${isNew ? '' : '<button class="btn danger" id="a-del" style="width:100%">删掉这个活动</button>'}
    `,
    actions: [
      { label: '取消', onClick: (close) => close() },
      { label: '保存', kind: 'blue', onClick: (close) => { close(); saveFn(); } },
    ],
    onMount: (el, close) => {
      $('#a-title', el).focus();
      $('#a-del', el)?.addEventListener('click', async () => {
        close();
        await store.removeRecord('activities', act.id);
        await render(root);
        toast('已删除', {
          actionLabel: '撤销',
          onAction: async () => { await store.saveRecord('activities', act); await render(root); },
        });
      });

      saveFn = async () => {
        const title = $('#a-title', el).value.trim();
        if (!title) { toast('先写活动名'); return; }
        await store.saveRecord('activities', {
          id: act?.id ?? uid(),
          game: $('#a-game', el).value.trim(),
          title,
          due: $('#a-due', el).value || todayStr(),
          note: $('#a-note', el).value.trim(),
          done: act?.done ?? false,
          createdAt: act?.createdAt ?? Date.now(),
        });
        toast(isNew ? '加好了' : '已保存');
        await render(root);
      };
    },
  });
}

/* ---------------- 表单：追更 ---------------- */
function openShowForm(root, show) {
  const isNew = !show;
  let saveFn = () => {};
  const draft = { weekday: show?.weekday ?? weekdayIndex1(todayStr()) };

  sheet({
    title: isNew ? '加一部在追的' : '改一下',
    body: `
      <input class="input" id="s-name" placeholder="番名 / 剧名" value="${esc(show?.name ?? '')}" />
      <div class="field" style="margin-top:12px"><label>每周几更新</label>
        <div class="tagset" id="s-week">${[1, 2, 3, 4, 5, 6, 7].map((w) =>
          `<button class="tag ${draft.weekday === w ? 'on' : ''}" data-w="${w}">${WEEK_CN[w]}</button>`).join('')}</div>
      </div>
      <div style="display:flex;gap:10px">
        <div class="field" style="flex:1"><label>看到第几集</label>
          <input class="input" id="s-current" type="number" min="0" value="${show?.current ?? 0}" />
        </div>
        <div class="field" style="flex:1"><label>共几集（可不填）</label>
          <input class="input" id="s-total" type="number" min="0" value="${show?.total ?? ''}" />
        </div>
      </div>
      ${isNew ? '' : '<button class="btn danger" id="s-del" style="width:100%">删掉这一部</button>'}
    `,
    actions: [
      { label: '取消', onClick: (close) => close() },
      { label: '保存', kind: 'blue', onClick: (close) => { close(); saveFn(); } },
    ],
    onMount: (el, close) => {
      $('#s-name', el).focus();
      $('#s-week', el).addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-w]');
        if (!b) return;
        draft.weekday = Number(b.dataset.w);
        $('#s-week', el).querySelectorAll('.tag').forEach((x) => x.classList.toggle('on', x === b));
      });
      $('#s-del', el)?.addEventListener('click', async () => {
        close();
        await store.removeRecord('shows', show.id);
        await render(root);
        toast('已删除', {
          actionLabel: '撤销',
          onAction: async () => { await store.saveRecord('shows', show); await render(root); },
        });
      });

      saveFn = async () => {
        const name = $('#s-name', el).value.trim();
        if (!name) { toast('先写番名'); return; }
        await store.saveRecord('shows', {
          id: show?.id ?? uid(),
          name,
          weekday: draft.weekday,
          current: Number($('#s-current', el).value) || 0,
          total: Number($('#s-total', el).value) || null,
          kind: show?.kind ?? 'anime',
        });
        toast(isNew ? '加好了' : '已保存');
        await render(root);
      };
    },
  });
}

/* ---------------- 体验记录：全屏编辑 ---------------- */
function openExperienceEditor(root, exp, preset = {}) {
  const isNew = !exp;
  const draft = {
    title: exp?.title ?? preset.title ?? '',
    type: exp?.type ?? preset.type ?? 'game',
    rating: exp?.rating ?? 0,
    progress: exp?.progress ?? '',
  };

  const layer = document.createElement('div');
  layer.className = 'fullscreen-editor';
  layer.innerHTML = `
    <div class="fe-head">
      <button class="icon-btn" id="fe-cancel" aria-label="取消"><svg class="ico"><use href="#i-back"/></svg></button>
      <div class="grow">${isNew ? '写一条体验' : '编辑体验'}</div>
      <button class="btn solid" id="fe-save" style="padding:9px 16px">保存</button>
    </div>
    <div class="fe-body">
      <input class="input plain" id="fe-title" placeholder="作品名" value="${esc(draft.title)}" />
      <div class="field" style="margin-top:12px">
        <label>类型</label>
        <div class="tagset" id="fe-type">${TYPES.map(([k, l]) =>
          `<button class="tag ${draft.type === k ? 'on' : ''}" data-t="${k}">${l}</button>`).join('')}</div>
      </div>
      <div class="field">
        <label>评分</label>
        <div class="tagset" id="fe-rating">${[1, 2, 3, 4, 5].map((i) =>
          `<button class="tag ${draft.rating >= i ? 'on' : ''}" data-r="${i}">${'★'.repeat(i)}</button>`).join('')}</div>
      </div>
      <div class="field">
        <label>想写的都写下来</label>
        <textarea id="fe-body" placeholder="看完 / 玩完之后的感受…">${esc(exp?.body ?? '')}</textarea>
      </div>
      <div class="field">
        <label>进度（可不填）</label>
        <input class="input plain" id="fe-progress" placeholder="看到第几集 / 玩到哪 / 已通关"
          value="${esc(draft.progress)}" />
      </div>
      ${isNew ? '' : '<button class="btn danger" id="fe-del" style="width:100%">删掉这条</button>'}
    </div>
  `;
  document.getElementById('overlay').appendChild(layer);

  const close = () => layer.remove();
  const titleEl = $('#fe-title', layer);
  titleEl.focus();

  $('#fe-cancel', layer).addEventListener('click', close);
  $('#fe-type', layer).addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-t]');
    if (!b) return;
    draft.type = b.dataset.t;
    $('#fe-type', layer).querySelectorAll('.tag').forEach((x) => x.classList.toggle('on', x === b));
  });
  $('#fe-rating', layer).addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-r]');
    if (!b) return;
    draft.rating = Number(b.dataset.r);
    $('#fe-rating', layer).querySelectorAll('.tag').forEach((x) =>
      x.classList.toggle('on', Number(x.dataset.r) <= draft.rating));
  });

  $('#fe-save', layer).addEventListener('click', async () => {
    const title = titleEl.value.trim();
    if (!title) { toast('先写作品名'); titleEl.focus(); return; }
    await store.saveRecord('experiences', {
      id: exp?.id ?? uid(),
      title,
      type: draft.type,
      rating: draft.rating,
      body: $('#fe-body', layer).value,
      progress: $('#fe-progress', layer).value.trim(),
      date: exp?.date ?? todayStr(),
      createdAt: exp?.createdAt ?? Date.now(),
    });
    close();
    toast(isNew ? '写好了' : '已保存');
    await render(root);
  });

  $('#fe-del', layer)?.addEventListener('click', async () => {
    close();
    await store.removeRecord('experiences', exp.id);
    await render(root);
    toast('已删除', {
      actionLabel: '撤销',
      onAction: async () => { await store.saveRecord('experiences', exp); await render(root); },
    });
  });
}

export function title() { return '游戏娱乐'; }
export function subtitle() { return ''; }

void weekdayIndex1; void relativeCN;
