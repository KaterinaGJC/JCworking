/**
 * 首页顶部一句话摘要（纯函数，便于单测）
 * 输入都是"今天"的客观数字，输出一句人话。
 */
export function buildSummary({ pendingTasks = 0, dueToday = 0, dueTomorrow = 0, showsToday = 0 } = {}) {
  const parts = [];
  if (pendingTasks > 0) parts.push(`今天还有 <b>${pendingTasks} 件事</b>没做完`);
  if (dueToday > 0) parts.push(`<b>${dueToday} 个活动</b>今天截止`);
  else if (dueTomorrow > 0) parts.push(`<b>${dueTomorrow} 个活动</b>明天截止`);
  if (showsToday > 0) parts.push(`<b>${showsToday} 部番</b>今天更新`);

  if (!parts.length) return '今天没有安排，随便记点什么吧';
  return parts.join('，');
}
