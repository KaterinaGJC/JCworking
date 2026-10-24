// M0 · 骨架与可安装
import { bootApp, shutdownApp, freshPage, goto, setOffline, ok, eq, report } from './lib.mjs';

let exitCode = 1;
try {
  await bootApp();
  const page = await freshPage();

  // --- 基本骨架 ---
  ok('底部 5 个标签都在', (await page.eval(`document.querySelectorAll('#tabbar .tab').length`)) === 5);
  ok('首页已渲染', (await page.eval(`document.querySelector('#view .page') !== null`)));
  eq('首页标题', await page.eval(`document.querySelector('#pageTitle').textContent`), '景臣');
  ok('顶部设置按钮可见', (await page.eval(`!document.querySelector('#btnGear').classList.contains('hidden')`)));

  // --- 五个标签可切换 ---
  const tabs = [
    ['plan', '今日计划'],
    ['schedule', '教培课表'],
    ['fun', '游戏娱乐'],
    ['memo', '快速备忘'],
    ['home', '景臣'],
  ];
  for (const [key, title] of tabs) {
    await page.click(`.tab[data-act="${key}"]`);
    await page.waitFor(`location.hash === '#/${key}'`, { message: `切到 ${key}` });
    await new Promise((r) => setTimeout(r, 120));
    eq(`切到「${title}」`, await page.eval(`document.querySelector('#pageTitle').textContent`), title);
    ok(`「${title}」页面容器渲染`, await page.eval(`document.querySelector('[data-page="${key}"]') !== null`));
    ok(`「${title}」标签高亮`, await page.eval(`document.querySelector('.tab[data-act="${key}"]').classList.contains('on')`));
  }

  // --- 详情页：无底栏、有返回 ---
  await goto(page, '#/settings');
  ok('详情页隐藏底部标签栏', await page.eval(`document.querySelector('#tabbar').hidden === true`));
  ok('详情页显示返回按钮', await page.eval(`!document.querySelector('#btnBack').classList.contains('hidden')`));
  eq('详情页标题', await page.eval(`document.querySelector('#pageTitle').textContent`), '数据与设置');

  await page.click('#btnBack');
  await page.waitFor(`location.hash === '#/home'`, { message: '返回首页' });
  ok('返回后底栏恢复', await page.eval(`document.querySelector('#tabbar').hidden === false`));

  // --- 未知路由回落到首页 ---
  await goto(page, '#/not-exist');
  ok('未知路由回落到首页', await page.eval(`document.querySelector('[data-page="home"]') !== null`));

  // --- manifest 与图标 ---
  const manifest = await page.eval(`fetch('/manifest.webmanifest').then(r => r.json())`);
  eq('manifest 名称', manifest.name, '景臣的工作生活');
  eq('manifest 显示模式', manifest.display, 'standalone');
  eq('manifest 图标数量', manifest.icons.length, 3);
  ok('manifest 含 maskable 图标', manifest.icons.some((i) => i.purpose === 'maskable'));
  const iconStatus = await page.eval(`Promise.all(${JSON.stringify(manifest.icons.map((i) => i.src))}.map(
    u => fetch('/' + u).then(r => r.status)))`);
  ok('三个图标文件都返回 200', iconStatus.every((s) => s === 200), JSON.stringify(iconStatus));

  // --- Service Worker 注册并接管 ---
  const swState = await page.eval(`(async () => {
    if (!('serviceWorker' in navigator)) return 'no-api';
    const reg = await navigator.serviceWorker.ready;
    for (let i = 0; i < 40 && !navigator.serviceWorker.controller; i++) {
      await new Promise(r => setTimeout(r, 100));
    }
    return navigator.serviceWorker.controller ? 'controlled' : 'registered-only';
  })()`);
  eq('Service Worker 已接管页面', swState, 'controlled');

  // --- 离线可用（A-04）---
  await setOffline(page, true);
  await page.reload();
  await page.waitFor(`document.querySelector('#view .page') !== null`, { message: '离线后页面仍渲染' });
  ok('离线状态下首页可渲染', await page.eval(`document.querySelector('#pageTitle').textContent === '景臣'`));
  const offlineNav = await page.eval(`(async () => {
    location.hash = '#/plan';
    await new Promise(r => setTimeout(r, 300));
    return document.querySelector('[data-page="plan"]') !== null;
  })()`);
  ok('离线状态下可切模块', offlineNav === true);
  await setOffline(page, false);
  await page.reload();
  await page.waitFor(`document.querySelector('#view .page') !== null`, { message: '恢复在线' });

  await page.close();
  exitCode = report('M0');
} catch (err) {
  console.error('M0 测试异常：', err);
  exitCode = 1;
} finally {
  await shutdownApp();
}
process.exit(exitCode);
