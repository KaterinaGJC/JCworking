import * as store from '../store.js';
import * as backup from '../backup.js';
import { applyTheme, currentTheme, applyBackground } from '../theme.js';
import { $, esc, todayStr, pad2 } from '../util.js';
import { toast, confirmBox, sheet, promptBox } from '../ui.js';
import { seedTestData } from '../dev.js';
import { getSlots, makeSlot } from '../core/slots.js';
import { addImageFromPicker, imageUrl } from '../image.js';

export const VERSION = '1.0.0';

let versionClicks = 0;
let versionTimer = null;

/** 备份提醒：超过 7 天没导出就提示 */
function backupHint() {
  const ts = store.getMeta('lastBackupAt');
  const hasData = ['tasks', 'lessons', 'notes', 'games', 'experiences']
    .some((k) => store.state[k].length > 0);
  if (!hasData) return '';
  if (!ts) {
    return `<div class="srow" data-backup-hint style="cursor:default"><span class="sl"
      style="color:var(--red);font-size:13px">还没备份过，建议先导出一份</span></div>`;
  }
  const days = Math.floor((Date.now() - ts) / 86400000);
  if (days >= 7) {
    return `<div class="srow" data-backup-hint style="cursor:default"><span class="sl"
      style="color:var(--red);font-size:13px">已经 ${days} 天没备份了</span></div>`;
  }
  return '';
}

function counts() {
  const c = {
    tasks: store.state.tasks.length,
    lessons: store.state.lessons.length,
    students: store.state.students.length,
    games: store.state.games.length,
    activities: store.state.activities.length,
    shows: store.state.shows.length,
    experiences: store.state.experiences.length,
    notes: store.state.notes.length,
  };
  return c;
}

function snapshotRows(list) {
  if (!list.length) return `<div class="srow"><span class="sl muted">还没有快照</span></div>`;
  return list.map((s) => `<button class="srow" data-snap="${s.day}">
      <span class="sl">${esc(backup.snapshotLabel(s.day))}</span>
      <span class="sv">恢复</span>
      <svg class="ico"><use href="#i-right"/></svg>
    </button>`).join('');
}

function themeBtn(val, label, cur) {
  return `<button data-theme-val="${val}" class="${cur === val ? 'on' : ''}">${label}</button>`;
}

function lastBackupText() {
  const ts = store.getMeta('lastBackupAt');
  if (!ts) return '从未导出';
  return `上次 ${backup.stampCN(ts)}`;
}

export async function render(root) {
  const c = counts();
  const snaps = await backup.listSnapshots();
  const cur = currentTheme();
  const weekStart = store.state.settings.weekStart === 7 ? 7 : 1;

  root.innerHTML = `
    <div class="statrow">
      <div class="stat"><div class="n">${c.lessons}</div><div class="l">课次</div></div>
      <div class="stat"><div class="n">${c.students}</div><div class="l">学生</div></div>
      <div class="stat"><div class="n">${c.notes}</div><div class="l">便签</div></div>
    </div>

    <div class="sgroup">
      <div class="sgt">数据概览</div>
      <button class="srow" data-act="none"><span class="sl">计划</span><span class="sv">${c.tasks} 条</span></button>
      <button class="srow" data-act="none"><span class="sl">课次</span><span class="sv">${c.lessons} 节</span></button>
      <button class="srow" data-act="none"><span class="sl">学生</span><span class="sv">${c.students} 人</span></button>
      <button class="srow" data-act="none"><span class="sl">游戏</span><span class="sv">${c.games} 款</span></button>
      <button class="srow" data-act="none"><span class="sl">活动</span><span class="sv">${c.activities} 个</span></button>
      <button class="srow" data-act="none"><span class="sl">追更</span><span class="sv">${c.shows} 部</span></button>
      <button class="srow" data-act="none"><span class="sl">体验记录</span><span class="sv">${c.experiences} 条</span></button>
      <button class="srow" data-act="none"><span class="sl">便签</span><span class="sv">${c.notes} 条</span></button>
    </div>

    <div class="sgroup">
      <div class="sgt">备份</div>
      ${backupHint()}
      <button class="srow" data-act="export"><span class="sl">导出备份文件</span>
        <span class="sv">${esc(lastBackupText())}</span>
        <svg class="ico"><use href="#i-right"/></svg></button>
      <button class="srow" data-act="import"><span class="sl">从文件导入</span>
        <svg class="ico"><use href="#i-right"/></svg></button>
    </div>

    <div class="sgroup">
      <div class="sgt">自动快照 · 保留最近 7 天</div>
      ${snapshotRows(snaps.slice(0, 3))}
      <button class="srow" data-act="allSnaps"><span class="sl">全部快照</span>
        <span class="sv">${snaps.length} 份</span>
        <svg class="ico"><use href="#i-right"/></svg></button>
    </div>

    <div class="sgroup">
      <div class="sgt">课表</div>
      <button class="srow" data-act="slots"><span class="sl">课表时间段</span>
        <span class="sv">${getSlots(store.state.settings).length} 节</span>
        <svg class="ico"><use href="#i-right"/></svg></button>
    </div>

    <div class="sgroup">
      <div class="sgt">外观</div>
      <div class="srow">
        <span class="sl">主题</span>
        <div class="seg-inline" id="themeSeg">
          ${themeBtn('light', '浅色', cur)}
          ${themeBtn('dark', '深色', cur)}
          ${themeBtn('auto', '跟随', cur)}
        </div>
      </div>
      <div class="srow">
        <span class="sl">一周从哪天开始</span>
        <div class="seg-inline" id="weekSeg">
          <button data-week-val="1" class="${weekStart === 1 ? 'on' : ''}">周一</button>
          <button data-week-val="7" class="${weekStart === 7 ? 'on' : ''}">周日</button>
        </div>
      </div>
      <button class="srow" data-act="background">
        <span class="sl">背景底图</span>
        <span class="sv">${store.state.settings.backgroundId ? '已设置' : '未设置'}</span>
        <svg class="ico"><use href="#i-right"/></svg>
      </button>
    </div>

    <div class="sgroup">
      <div class="sgt">关于</div>
      <button class="srow" data-act="install"><span class="sl">怎么添加到桌面</span>
        <svg class="ico"><use href="#i-right"/></svg></button>
      <button class="srow" data-act="version"><span class="sl">版本</span>
        <span class="sv">v${VERSION}</span></button>
    </div>

    <div class="sgroup">
      <button class="srow danger" data-act="clear"><span class="sl">清空所有数据</span>
        <svg class="ico"><use href="#i-right"/></svg></button>
    </div>

    <div class="proto-note">
      数据只存在这台手机上，不上传任何服务器。<br />
      换手机或清理浏览器前，记得先「导出备份文件」。
    </div>
  `;

  // 主题
  $('#themeSeg', root).addEventListener('click', async (ev) => {
    const b = ev.target.closest('button[data-theme-val]');
    if (!b) return;
    const val = b.dataset.themeVal;
    applyTheme(val);
    await store.saveSettings({ theme: val });
    root.querySelectorAll('#themeSeg button').forEach((x) => x.classList.toggle('on', x === b));
    toast('主题已切换');
  });

  // 周起始
  $('#weekSeg', root).addEventListener('click', async (ev) => {
    const b = ev.target.closest('button[data-week-val]');
    if (!b) return;
    const val = Number(b.dataset.weekVal);
    await store.saveSettings({ weekStart: val });
    root.querySelectorAll('#weekSeg button').forEach((x) => x.classList.toggle('on', x === b));
    toast('已保存');
  });

  // 快照恢复
  root.addEventListener('click', async (ev) => {
    const snap = ev.target.closest('[data-snap]');
    if (!snap) return;
    const day = snap.dataset.snap;
    const yes = await confirmBox({
      title: '恢复这份快照？',
      desc: `数据会回到 ${esc(backup.snapshotLabel(day))} 那天的状态，现在的数据会被覆盖。`,
      okText: '恢复',
      danger: true,
    });
    if (!yes) return;
    const res = await backup.restoreSnapshot(day);
    if (!res.ok) { toast(res.error || '恢复失败'); return; }
    toast('已恢复到那天的数据');
    await render(root);
  });

  // 主要动作
  root.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;

    if (act === 'export') {
      try {
        await backup.exportBackup();
        toast('已导出到手机「下载」目录');
        const sv = btn.querySelector('.sv');
        if (sv) sv.textContent = lastBackupText();
      } catch (e) {
        toast('导出失败：' + (e?.message || e));
      }
      return;
    }

    if (act === 'import') {
      const file = await backup.pickFile();
      if (!file) return;
      const checked = await backup.readBackupFile(file);
      if (!checked.ok) { toast(checked.error); return; }
      const mode = await chooseImportMode();
      if (!mode) return;
      try {
        await backup.applyBackup(checked, mode);
        applyTheme(store.state.settings.theme);
        toast(mode === 'merge' ? '已合并导入' : '已导入，原有数据已替换');
        await render(root);
      } catch (e) {
        toast('导入失败：' + (e?.message || e));
      }
      return;
    }

    if (act === 'allSnaps') {
      const list = await backup.listSnapshots();
      sheet({
        title: '全部快照',
        body: list.length
          ? `<div class="sgroup" style="margin:0">${snapshotRows(list)}</div>`
          : `<div class="empty">还没有快照，明天打开时自动生成</div>`,
        actions: [{ label: '关闭', onClick: (close) => close() }],
        onMount: (el, close) => {
          el.addEventListener('click', async (ev) => {
            const snap = ev.target.closest('[data-snap]');
            if (!snap) return;
            close();
            await new Promise((r) => setTimeout(r, 60));
            document.querySelector(`[data-snap="${snap.dataset.snap}"]`)?.click();
          });
        },
      });
      return;
    }

    if (act === 'slots') {
      openSlotsEditor();
      return;
    }

    if (act === 'install') {
      sheet({
        title: '怎么添加到桌面',
        body: `<div style="font-size:14px;line-height:1.9;color:var(--text2)">
          1. 用手机 Chrome 打开这个应用地址<br />
          2. 点右上角「⋮」菜单<br />
          3. 选「添加到主屏幕」或「安装应用」<br />
          4. 桌面上会出现图标，之后点图标直接全屏打开<br /><br />
          装好之后断网也能用，数据只存在手机上。
        </div>`,
        actions: [{ label: '知道了', kind: 'solid', onClick: (close) => close() }],
      });
      return;
    }

    if (act === 'version') {
      // 隐藏入口：连点 5 次灌测试数据
      versionClicks = (versionClicks ?? 0) + 1;
      clearTimeout(versionTimer);
      versionTimer = setTimeout(() => { versionClicks = 0; }, 2500);
      if (versionClicks >= 5) {
        versionClicks = 0;
        const res = await seedTestData({ clearFirst: false });
        toast(`已灌入测试数据：便签 ${res.notes} / 计划 ${res.tasks} / 课次 ${res.lessons}`);
        await render(root);
      }
      return;
    }

    if (act === 'background') {
      const bgId = store.state.settings.backgroundId;
      const bgUrl = imageUrl(bgId);
      sheet({
        title: '背景底图',
        body: `<div class="small muted" style="line-height:1.8">
            选一张图片做整个应用的底图。卡片会变成半透明，文字仍然清楚。
          </div>
          ${bgUrl ? `<div class="imgs" style="margin-top:12px">
            <div class="img-thumb-wrap"><img class="img-thumb" src="${bgUrl}" alt="当前背景" /></div>
          </div>` : '<div class="empty" style="padding:16px 0">还没有设置底图</div>'}`,
        actions: [
          { label: '移除', onClick: async (close) => {
            close();
            await store.saveSettings({ backgroundId: null });
            applyBackground('');
            toast('背景已移除');
            await render(root);
          } },
          { label: '选图片', kind: 'blue', onClick: async (close) => {
            close();
            try {
              const id = await addImageFromPicker();
              if (!id) return;
              await store.saveSettings({ backgroundId: id });
              applyBackground(imageUrl(id));
              toast('背景已设置');
              await render(root);
            } catch (err) {
              toast(err?.message || '这张图片用不了');
            }
          } },
        ],
      });
      return;
    }

    if (act === 'clear') {
      const v = await promptBox({
        title: '清空所有数据',
        placeholder: '输入「清空」两个字确认',
        okText: '确认清空',
      });
      if (v === null) return;
      if (v !== '清空') { toast('没有清空（需要输入「清空」）'); return; }
      await backup.clearAll();
      applyTheme('auto');
      applyBackground('');
      toast('数据已清空');
      await render(root);
      return;
    }
  });
}

/* ---------------- 课表时间段管理 ---------------- */
function openSlotsEditor() {
  const slots = getSlots(store.state.settings).map((s) => ({ ...s }));

  const persist = async () => {
    await store.saveSettings({ timeSlots: slots.map((s) => ({ ...s })) });
  };

  const rowsHtml = () => slots.length
    ? slots.map((s, i) => `<button class="srow" data-slot-edit="${i}">
        <span class="sl">${esc(s.label)}</span>
        <span class="sv">${esc(s.start)}–${esc(s.end)}</span>
        <svg class="ico"><use href="#i-right"/></svg>
      </button>`).join('')
    : '<div class="empty" style="padding:18px 0">还没有时间段，点下面的「加一节」</div>';

  sheet({
    title: '课表时间段',
    body: `<div class="sgroup" style="margin:0" id="slotList">${rowsHtml()}</div>
      <div class="small muted" style="margin-top:10px;line-height:1.7">
        点一节可以改名称和起止时间。改完立刻生效，已经排好的课不会丢。
      </div>
      <button class="btn" id="slotReset" style="width:100%;margin-top:12px">恢复默认的 8 节课</button>`,
    actions: [
      { label: '加一节', onClick: () => { slots.push(makeSlot(slots)); persist().then(() => openSlotsEditor()); } },
      { label: '完成', kind: 'solid', onClick: (close) => close() },
    ],
    onMount: (el) => {
      el.addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-slot-edit]');
        if (!b) return;
        openSlotForm(slots, Number(b.dataset.slotEdit), async () => {
          await persist();
          openSlotsEditor();
        });
      });
      $('#slotReset', el).addEventListener('click', () => {
        slots.splice(0, slots.length, ...getSlots({}));
        persist().then(() => openSlotsEditor());
      });
    },
  });
}

function openSlotForm(slots, index, onDone) {
  const isNew = index < 0 || !slots[index];
  const cur = isNew ? makeSlot(slots) : { ...slots[index] };
  let saveFn = () => {};
  sheet({
    title: isNew ? '加一节' : '改这一节',
    body: `
      <div class="field"><label>名称</label>
        <input class="input" id="s-label" value="${esc(cur.label)}" placeholder="例如 第1节 / 早读" /></div>
      <div style="display:flex;gap:10px">
        <div class="field" style="flex:1"><label>开始</label>
          <input class="input" id="s-start" type="time" value="${esc(cur.start)}" /></div>
        <div class="field" style="flex:1"><label>结束</label>
          <input class="input" id="s-end" type="time" value="${esc(cur.end)}" /></div>
      </div>
      ${isNew ? '' : '<button class="btn danger" id="s-del" style="width:100%">删掉这一节</button>'}
    `,
    actions: [
      { label: '取消', onClick: (close) => close() },
      { label: '保存', kind: 'blue', onClick: (close) => { close(); saveFn(); } },
    ],
    onMount: (el, close) => {
      const labelEl = $('#s-label', el);
      labelEl.focus();
      labelEl.setSelectionRange(labelEl.value.length, labelEl.value.length);

      const collect = () => ({
        id: cur.id,
        label: labelEl.value.trim() || cur.label,
        start: $('#s-start', el).value || cur.start,
        end: $('#s-end', el).value || cur.end,
      });

      saveFn = async () => {
        const next = collect();
        if (isNew) slots.push(next);
        else slots[index] = next;
        toast(isNew ? '加好了' : '已保存');
        await onDone();
      };

      $('#s-del', el)?.addEventListener('click', async () => {
        close();
        slots.splice(index, 1);
        toast('这一节已删除');
        await onDone();
      });
    },
  });
}

function chooseImportMode() {  return new Promise((resolve) => {
    sheet({
      title: '怎么导入？',
      body: `<div style="font-size:14px;line-height:1.8;color:var(--text2)">
        <b>覆盖</b>：用文件里的数据替换这台手机上的全部数据。<br />
        <b>合并</b>：保留现有数据，同一条以较新的为准。
      </div>`,
      actions: [
        { label: '取消', onClick: (close) => { close(); resolve(null); } },
        { label: '合并', onClick: (close) => { close(); resolve('merge'); } },
        { label: '覆盖', kind: 'blue', onClick: (close) => { close(); resolve('overwrite'); } },
      ],
    });
  });
}

export function subtitle() {
  return todayStr() ? '' : '';
}
