// 里程碑测试的小工具：真 Chrome + 静态服务器 + 断言
import { startServer } from '../tools/server.mjs';
import { launchBrowser, resetApp } from '../tools/cdp.mjs';

let server = null;
let browser = null;

export async function bootApp() {
  server = await startServer('app', 0);
  browser = await launchBrowser();
  return { server, browser, origin: server.url };
}

export async function shutdownApp() {
  try { await browser?.close(); } catch { /* ignore */ }
  try { await server?.close(); } catch { /* ignore */ }
  browser = null;
  server = null;
}

export function getOrigin() {
  return server.url;
}

export async function freshPage({ path = '/index.html' } = {}) {
  const page = await browser.newPage('about:blank');
  // 先关掉所有页面连接，再用浏览器级 API 清数据，避免 deleteDatabase 被阻塞后异步生效
  await page.send('Storage.clearDataForOrigin', {
    origin: server.url,
    storageTypes: 'indexeddb,local_storage,cache_storage',
  }).catch(() => {});
  await page.send('Page.setDownloadBehavior', { behavior: 'deny' }).catch(() => {});
  await page.goto(`${server.url}${path}#/home`);
  await page.waitFor(`document.querySelector('#view .page') !== null`,
    { message: '页面已渲染', timeout: 15000 });
  return page;
}

export async function goto(page, hash) {
  await page.eval(`location.hash = ${JSON.stringify(hash)}`);
  await page.waitFor(`location.hash === ${JSON.stringify(hash)}`, { message: `hash ${hash}` });
  await new Promise((r) => setTimeout(r, 120));
}

export async function setOffline(page, offline = true) {
  await page.send('Network.enable');
  await page.send('Network.emulateNetworkConditions', {
    offline,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
}

const state = { pass: 0, fail: 0, failures: [] };

export function ok(name, cond, extra = '') {
  if (cond) { state.pass++; console.log(`  ok   ${name}`); }
  else {
    state.fail++;
    state.failures.push(name);
    console.log(` FAIL  ${name}${extra ? ' — ' + extra : ''}`);
  }
  return !!cond;
}

export function eq(name, actual, expected) {
  const same = JSON.stringify(actual) === JSON.stringify(expected);
  return ok(name, same, same ? '' : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

export function report(title) {
  const total = state.pass + state.fail;
  console.log(`\n${title}: ${state.pass}/${total} 通过${state.fail ? `, ${state.fail} 失败` : ''}`);
  if (state.fail) console.log('失败项：\n - ' + state.failures.join('\n - '));
  return state.fail === 0 ? 0 : 1;
}
