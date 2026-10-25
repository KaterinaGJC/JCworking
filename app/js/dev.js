// 开发/自测用：一键灌入测试数据（设置页里的隐藏入口，也给自动化测试调用）
import * as store from './store.js';
import { uid, todayStr, addDays, weekdayIndex1 } from './util.js';

const WORDS = ['买电池', '交总结', '回消息', '备课', '洗衣服', '打电话', '看文献', '整理桌面',
  '取快递', '记账', '喝水', '拉伸', '改作业', '约时间', '查资料', '写周报'];

export async function seedTestData({
  notes = 100, tasks = 30, lessons = 8, games = 6, activities = 5,
  shows = 4, experiences = 3, posts = 4, clearFirst = false,
} = {}) {
  if (clearFirst) {
    for (const kind of ['notes', 'tasks', 'lessons', 'games', 'activities', 'shows', 'experiences', 'posts']) {
      for (const r of [...store.state[kind]]) await store.removeRecord(kind, r.id);
    }
  }

  const today = todayStr();
  const now = Date.now();

  if (notes) {
    const rows = Array.from({ length: notes }, (_, i) => ({
      id: uid(),
      content: `${WORDS[i % WORDS.length]} · 第 ${i + 1} 条测试便签`,
      color: ['y', 'b', 'g', 'p'][i % 4],
      pinned: i % 17 === 0,
      createdAt: now - i * 60000,
    }));
    await store.saveMany('notes', rows);
  }

  if (tasks) {
    const rows = Array.from({ length: tasks }, (_, i) => {
      const hasTime = i % 3 !== 0;
      return {
        id: uid(),
        date: addDays(today, i % 5 === 0 ? 1 : 0),
        title: `${WORDS[i % WORDS.length]}（测试 ${i + 1}）`,
        time: hasTime ? `${String(7 + (i % 14)).padStart(2, '0')}:${i % 2 ? '30' : '00'}` : null,
        note: '',
        repeat: { type: 'none', weekdays: [], sourceId: null },
        done: i % 4 === 0,
        doneAt: i % 4 === 0 ? now : null,
        sort: i * 10,
        createdAt: now - i * 1000,
      };
    });
    await store.saveMany('tasks', rows);
  }

  if (lessons) {
    const names = ['王小明', '李雷', '韩梅梅', '张三', '赵四'];
    const rows = [];
    for (let i = 0; i < lessons; i++) {
      const members = [{
        studentId: uid(),
        name: names[i % names.length],
        state: ['great', 'ok', 'need', null][i % 4],
        note: '',
        attendance: 'done',
      }];
      if (i % 3 === 0) {
        members.push({ studentId: uid(), name: names[(i + 1) % names.length], state: 'ok', note: '', attendance: 'done' });
      }
      rows.push({
        id: uid(),
        date: addDays(today, i - 3),
        start: `${String(9 + (i % 9)).padStart(2, '0')}:00`,
        duration: 90,
        type: members.length > 1 ? 'small' : 'one',
        place: '3 号教室',
        status: i % 4 === 0 ? 'todo' : 'done',
        content: `第 ${i + 1} 次课：${['一次函数', '二次函数', '几何证明', '概率初步'][i % 4]}`,
        homework: `练习册 P${20 + i}`,
        repeat: { type: 'none', weekdays: [], sourceId: null },
        members,
        createdAt: now,
      });
    }
    await store.saveMany('lessons', rows);
    for (const name of names) {
      if (!store.state.students.some((s) => s.name === name)) {
        await store.saveRecord('students', { id: uid(), name, createdAt: now });
      }
    }
  }

  if (games) {
    const rows = Array.from({ length: games }, (_, i) => ({
      id: uid(),
      name: ['明日方舟', '星露谷物语', '空洞骑士', '塞尔达', '暖雪', '哈迪斯'][i % 6] + (i > 5 ? ` ${i}` : ''),
      platform: ['手机', 'PC', 'Switch'][i % 3],
      status: ['playing', 'wish', 'cleared'][i % 3],
      rating: (i % 5) + 1,
      note: '测试数据',
    }));
    await store.saveMany('games', rows);
  }

  if (activities) {
    const rows = Array.from({ length: activities }, (_, i) => ({
      id: uid(),
      game: '明日方舟',
      title: `测试活动 ${i + 1}`,
      due: addDays(today, [1, 0, 5, 10, -2][i % 5]),
      note: '',
      done: false,
      createdAt: now,
    }));
    await store.saveMany('activities', rows);
  }

  if (shows) {
    const rows = Array.from({ length: shows }, (_, i) => ({
      id: uid(),
      name: `测试番剧 ${i + 1}`,
      weekday: (weekdayIndex1(today) + i) % 7 + 1,
      current: i * 2,
      total: 12 + i,
      kind: 'anime',
    }));
    await store.saveMany('shows', rows);
  }

  if (experiences) {
    const rows = Array.from({ length: experiences }, (_, i) => ({
      id: uid(),
      title: `测试作品 ${i + 1}`,
      type: ['game', 'movie', 'tv', 'anime'][i % 4],
      rating: (i % 5) + 1,
      body: '这是一段用于压测的正文。'.repeat(20),
      progress: '已通关',
      date: today,
      createdAt: now - i * 1000,
    }));
    await store.saveMany('experiences', rows);
  }

  if (posts) {
    const POST_TEXTS = [
      '今天把课表改成网格了，一眼能看完整周，比之前顺多了。',
      '带了三个学生，小班那种节奏还是得再磨一磨。',
      '下班路上听了一张老专辑，突然很想写点什么。',
      '把备份导出来存了一份，心里踏实不少。',
    ];
    const rows = Array.from({ length: posts }, (_, i) => ({
      id: uid(),
      text: POST_TEXTS[i % POST_TEXTS.length],
      images: [],
      liked: i % 3 === 0,
      comments: i % 2 === 0 ? [
        { id: uid(), text: '自己给自己盖个楼，记一下当时的想法。', createdAt: now - i * 60000 + 30000 },
      ] : [],
      createdAt: now - i * 3600 * 1000,
    }));
    await store.saveMany('posts', rows);
  }

  return {
    notes: store.state.notes.length,
    tasks: store.state.tasks.length,
    lessons: store.state.lessons.length,
    games: store.state.games.length,
    activities: store.state.activities.length,
    shows: store.state.shows.length,
    experiences: store.state.experiences.length,
    posts: store.state.posts.length,
  };
}
