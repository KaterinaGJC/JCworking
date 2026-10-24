import { launchBrowser, resetApp } from '../tools/cdp.mjs';
import { startServer } from '../tools/server.mjs';

const server = await startServer('tests/fixtures', 0);
const browser = await launchBrowser();
let failed = 0;
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? '  ok  ' : ' FAIL '} ${name}${extra ? ' — ' + extra : ''}`);
  if (!cond) failed++;
};

try {
  const page = await browser.newPage('about:blank');
  await page.goto(`${server.url}/hello.html`);
  ok('页面加载', await page.eval(`document.title === 'hello'`));

  // DOM 交互
  await page.click('#btn');
  ok('点击后计数 = 1', (await page.eval(`document.querySelector('#out').textContent`)) === '1');

  // 输入
  await page.type('#inp', '景臣');
  ok('设置 input 值', (await page.eval(`document.querySelector('#inp').value`)) === '景臣');

  // async eval
  const sum = await page.eval(`(async () => { await new Promise(r => setTimeout(r, 20)); return 1 + 2; })()`);
  ok('异步求值', sum === 3);

  // IndexedDB 可用
  await page.goto(`${server.url}/app.html`);
  const dbOk = await page.eval(`(async () => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('probe', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('s', { keyPath: 'id' });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    await new Promise((res, rej) => {
      const tx = db.transaction('s', 'readwrite');
      tx.objectStore('s').put({ id: 1, v: 'ok' });
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
    const got = await new Promise((res, rej) => {
      const tx = db.transaction('s');
      const rq = tx.objectStore('s').get(1);
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
    });
    return got.v;
  })()`);
  ok('IndexedDB 读写', dbOk === 'ok');

  // 刷新后 IndexedDB 仍在（持久化前提）
  await page.reload();
  const dbOk2 = await page.eval(`(async () => {
    const db = await new Promise((res) => { const r = indexedDB.open('probe', 1); r.onsuccess = () => res(r.result); });
    return await new Promise((res) => {
      const rq = db.transaction('s').objectStore('s').get(1);
      rq.onsuccess = () => res(rq.result ? rq.result.v : null);
    });
  })()`);
  ok('刷新后 IndexedDB 保留', dbOk2 === 'ok');

  // Service Worker 可注册（PWA 前提）
  await page.goto(`${server.url}/app.html`);
  const swOk = await page.eval(`(async () => {
    if (!('serviceWorker' in navigator)) return 'no-api';
    try { const r = await navigator.serviceWorker.register('/sw-probe.js'); return r ? 'ok' : 'null'; }
    catch (e) { return 'err:' + e.message; }
  })()`);
  ok('Service Worker 可注册', swOk === 'ok', swOk);

  await page.screenshot('tests/fixtures/smoke.png');
  await page.close();
} finally {
  await browser.close();
  await server.close();
}

console.log(failed === 0 ? '\nSMOKE PASS' : `\nSMOKE FAIL (${failed})`);
process.exit(failed === 0 ? 0 : 1);
