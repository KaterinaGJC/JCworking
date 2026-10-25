// 子目录部署验证：GitHub Pages 会部署在 https://xxx.github.io/<仓库名>/ 下，
// 这里用 /app/index.html 模拟同样的情形，确认所有相对路径、SW 作用域都正确。
import { startServer } from '../tools/server.mjs';
import { launchBrowser } from '../tools/cdp.mjs';

let failed = 0;
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? '  ok  ' : ' FAIL '} ${name}${extra ? ' — ' + extra : ''}`);
  if (!cond) failed++;
};

const server = await startServer('.', 0);
const browser = await launchBrowser();
try {
  const page = await browser.newPage('about:blank');
  const bad = [];
  page.on((m) => {
    if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) {
      bad.push(`${m.params.response.status} ${m.params.response.url}`);
    }
  });
  await page.send('Network.enable');

  await page.goto(`${server.url}/app/index.html#/home`);
  await page.waitFor(`document.querySelector('.home-body') !== null`, { message: '子目录下首页渲染' });
  ok('子目录下首页能渲染', true);
  ok('没有 404 资源', bad.length === 0, bad.join(' | '));

  const sw = await page.eval(`(async () => {
    const reg = await navigator.serviceWorker.ready;
    for (let i = 0; i < 40 && !navigator.serviceWorker.controller; i++) {
      await new Promise(r => setTimeout(r, 100));
    }
    return { scope: reg.scope, controlled: !!navigator.serviceWorker.controller };
  })()`);
  ok('SW 作用域落在子目录内', sw.scope.includes('/app/'), sw.scope);
  ok('SW 已接管页面', sw.controlled);

  // 各页面模块的相对动态导入也要能加载（计划已并入首页，plan.js 由 home.js 动态引入）
  for (const [hash, sel] of [['#/home', '.plan-body'], ['#/schedule', '.schedule-body'],
    ['#/fun', '.fun-body'], ['#/memo', '.memo-body'], ['#/settings', '.sgroup']]) {
    await page.eval(`location.hash = ${JSON.stringify(hash)}`);
    await page.waitFor(`document.querySelector(${JSON.stringify(sel)}) !== null`, { message: hash });
    ok(`子目录下可打开 ${hash}`, true);
  }
  ok('切换页面后依然没有 404', bad.length === 0, bad.join(' | '));

  await page.close();
} finally {
  await browser.close();
  await server.close();
}

console.log(failed === 0 ? '\n子目录部署: 全部通过' : `\n子目录部署: ${failed} 项失败`);
process.exit(failed === 0 ? 0 : 1);
