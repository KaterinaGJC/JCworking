import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);

export function findBrowser() {
  for (const p of CHROME_CANDIDATES) if (fs.existsSync(p)) return p;
  throw new Error('no chrome/edge found');
}

async function waitHttp(url, timeoutMs = 15000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.json();
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`timeout waiting for ${url}`);
}

export async function launchBrowser({ port = 0 } = {}) {
  const exe = findBrowser();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jc-chrome-'));
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-crash-reporter',
    '--disable-breakpad',
    '--disable-background-networking',
    '--disable-sync',
    `--user-data-dir=${userDataDir}`,
    '--remote-debugging-port=0',
    'about:blank',
  ];
  const child = spawn(exe, args, { stdio: 'ignore' });
  const wsUrlFile = path.join(userDataDir, 'DevToolsActivePort');
  const end = Date.now() + 20000;
  let info = null;
  while (Date.now() < end) {
    if (fs.existsSync(wsUrlFile)) {
      const txt = fs.readFileSync(wsUrlFile, 'utf8').trim().split(/\r?\n/);
      if (txt[0]) {
        const p = Number(txt[0]);
        try { info = await waitHttp(`http://127.0.0.1:${p}/json/version`, 2000); info.port = p; break; } catch { /* retry */ }
      }
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!info) { child.kill(); throw new Error('browser did not expose devtools'); }

  return {
    wsEndpoint: info.webSocketDebuggerUrl,
    port: info.port,
    async newPage(url = 'about:blank') {
      const res = await fetch(`http://127.0.0.1:${info.port}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
      const target = await res.json();
      return connect(target.webSocketDebuggerUrl);
    },
    async close() {
      try { child.kill(); } catch { /* ignore */ }
      await new Promise((r) => setTimeout(r, 200));
      try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch { /* ignore */ }
    },
  };
}

let seq = 0;
async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  const pending = new Map();
  const listeners = new Set();
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(`${msg.error.message} (${JSON.stringify(msg.error.data ?? '')})`));
      else resolve(msg.result);
    } else if (msg.method) {
      for (const fn of listeners) fn(msg);
    }
  });

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => {
      if (pending.has(id)) { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }
    }, 30000);
  });

  await send('Page.enable');
  await send('Runtime.enable');

  const page = {
    send,
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    async goto(url, { waitMs = 0 } = {}) {
      const done = new Promise((resolve) => {
        const off = page.on((m) => { if (m.method === 'Page.loadEventFired') { off(); resolve(); } });
      });
      await send('Page.navigate', { url });
      await Promise.race([done, new Promise((r) => setTimeout(r, 8000))]);
      if (waitMs) await new Promise((r) => setTimeout(r, waitMs));
    },
    async eval(fnOrExpr, ...args) {
      const isFn = typeof fnOrExpr === 'function';
      const expression = isFn
        ? `(${fnOrExpr.toString()})(${args.map((a) => JSON.stringify(a)).join(',')})`
        : fnOrExpr;
      const r = await send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
        userGesture: true,
      });
      if (r.exceptionDetails) {
        const d = r.exceptionDetails;
        throw new Error(`page error: ${d.exception?.description ?? d.text}`);
      }
      return r.result.value;
    },
    async waitFor(expr, { timeout = 8000, interval = 80, message = '' } = {}) {
      const end = Date.now() + timeout;
      let lastErr;
      while (Date.now() < end) {
        try {
          const v = await page.eval(expr);
          if (v) return v;
        } catch (e) { lastErr = e; }
        await new Promise((r) => setTimeout(r, interval));
      }
      throw new Error(`waitFor timeout: ${message || expr}${lastErr ? ` | last error: ${lastErr.message}` : ''}`);
    },
    async click(selector) {
      const ok = await page.eval(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return false;
        el.scrollIntoView({block:'center'});
        el.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true, view:window}));
        return true;
      })()`);
      if (!ok) throw new Error(`click: not found ${selector}`);
      await new Promise((r) => setTimeout(r, 60));
    },
    /** 真实的鼠标点击（会触发浏览器默认行为，比如 input 获得焦点） */
    async realClick(selector) {
      const pos = await page.eval(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return null;
        el.scrollIntoView({ block: 'center' });
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      })()`);
      if (!pos) throw new Error(`realClick: not found ${selector}`);
      await page.send('Input.dispatchMouseEvent', {
        type: 'mousePressed', x: pos.x, y: pos.y, button: 'left', clickCount: 1,
      });
      await page.send('Input.dispatchMouseEvent', {
        type: 'mouseReleased', x: pos.x, y: pos.y, button: 'left', clickCount: 1,
      });
      await new Promise((r) => setTimeout(r, 120));
    },
    async type(selector, text) {
      const ok = await page.eval(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return false;
        el.focus();
        const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
        setter.call(el, ${JSON.stringify(text)});
        el.dispatchEvent(new Event('input', {bubbles:true}));
        el.dispatchEvent(new Event('change', {bubbles:true}));
        return true;
      })()`);
      if (!ok) throw new Error(`type: not found ${selector}`);
      await new Promise((r) => setTimeout(r, 60));
    },
    async press(key, selector = null) {
      await page.eval(`(() => {
        const el = ${selector ? `document.querySelector(${JSON.stringify(selector)})` : 'document.activeElement'};
        if (!el) return;
        for (const type of ['keydown','keyup']) {
          el.dispatchEvent(new KeyboardEvent(type, {key:${JSON.stringify(key)}, bubbles:true, cancelable:true}));
        }
      })()`);
      await new Promise((r) => setTimeout(r, 60));
    },
    async screenshot(file) {
      const { data } = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(file, Buffer.from(data, 'base64'));
    },
    async reload() { await send('Page.reload', {}); await new Promise((r) => setTimeout(r, 600)); },
    async close() {
      try { ws.close(); } catch { /* ignore */ }
    },
  };
  return page;
}

/** 清空应用数据库并回到首页：每个用例开始前调用，保证互不干扰 */
export async function resetApp(page, origin) {
  await page.goto(`${origin}/index.html`);
  await page.eval(`(async () => {
    try { localStorage.clear(); } catch {}
    await new Promise((resolve) => {
      const req = indexedDB.deleteDatabase('jc-life');
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  })()`);
  await page.goto(`${origin}/index.html#/home`);
  await page.waitFor(`document.querySelector('#p-home.active') !== null`, { message: 'home rendered' });
}
