// 首次使用说明卡：每个模块第一次打开时出现一次，关掉不再出现
import * as store from './store.js';

const TEXTS = {
  home: '<b>每天第一眼看这里</b>：今天还剩什么事、有没有快到期的东西。',
  plan: '<b>按一天来排</b>：有时间的进时间轴，没时间的放「待安排」。右下角加一条。',
  schedule: '<b>按周看课</b>：点一节课进去，记内容、作业和每个学生的状态。右上角能进学生名单。',
  fun: '<b>四个分区</b>：在玩什么、活动几时截止、番追到第几集、看完想说的都在这。',
  memo: '<b>想到什么就写</b>，回车即存。左滑删除，点开可以改颜色或置顶。',
};

export async function tipHtml(key) {
  const text = TEXTS[key];
  if (!text) return '';
  if (store.getMeta(`tip:${key}`)) return '';
  await store.setMeta(`tip:${key}`, true);
  return `<div class="tipcard" data-tipcard="${key}">
    ${text}
    <button class="x" data-tip-close aria-label="关闭">×</button>
  </div>`;
}
