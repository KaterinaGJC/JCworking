// 用本地 Chrome 把 SVG 渲染成 PNG 图标（无第三方依赖）
import fs from 'node:fs';
import path from 'node:path';
import { launchBrowser } from './cdp.mjs';

const ICON_DIR = path.resolve('app/icons');
const svgSrc = fs.readFileSync(path.join(ICON_DIR, 'icon.svg'), 'utf8');
const defs = svgSrc.match(/<defs>[\s\S]*?<\/defs>/)?.[0] ?? '';
const inner = svgSrc.match(/<rect width="512"[\s\S]*?<\/g>/)?.[0] ?? '';

const page = (size, body, extraStyle = '') => `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;padding:0;width:${size}px;height:${size}px;overflow:hidden;background:transparent}
svg{display:block;width:${size}px;height:${size}px}${extraStyle}</style></head><body>${body}</body></html>`;

const variants = [
  {
    file: 'icon-192.png', size: 192,
    html: page(192, `<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">${defs}
      <rect width="512" height="512" rx="112" fill="url(#g)"/>
      <g fill="none" stroke="#fff" stroke-width="26" stroke-linecap="round" stroke-linejoin="round">
        <rect x="128" y="152" width="256" height="236" rx="40"/><path d="M128 228h256"/>
        <path d="M196 120v62M316 120v62"/><path d="M196 300l40 40 84-88"/>
      </g></svg>`),
  },
  {
    file: 'icon-512.png', size: 512,
    html: page(512, `<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">${defs}
      <rect width="512" height="512" rx="112" fill="url(#g)"/>
      <g fill="none" stroke="#fff" stroke-width="26" stroke-linecap="round" stroke-linejoin="round">
        <rect x="128" y="152" width="256" height="236" rx="40"/><path d="M128 228h256"/>
        <path d="M196 120v62M316 120v62"/><path d="M196 300l40 40 84-88"/>
      </g></svg>`),
  },
  {
    // maskable：满底 + 内容缩到安全区（72%）
    file: 'icon-maskable-512.png', size: 512,
    html: page(512, `<div style="width:512px;height:512px;background:linear-gradient(135deg,#4A7BF0,#1F9D8B);display:grid;place-items:center">
      <svg viewBox="0 0 512 512" width="368" height="368" style="width:368px;height:368px" xmlns="http://www.w3.org/2000/svg">
        <g fill="none" stroke="#fff" stroke-width="30" stroke-linecap="round" stroke-linejoin="round" transform="translate(128,128) scale(0.5)">
          <rect x="0" y="48" width="512" height="472" rx="80"/><path d="M0 200h512"/>
          <path d="M136 0v124M376 0v124"/><path d="M136 360l80 80 168-176"/>
        </g>
      </svg></div>`),
  },
];

const browser = await launchBrowser();
try {
  for (const v of variants) {
    const p = await browser.newPage('about:blank');
    await p.goto('data:text/html;charset=utf-8,' + encodeURIComponent(v.html), { waitMs: 120 });
    const { data } = await p.send('Page.captureScreenshot', {
      format: 'png',
      clip: { x: 0, y: 0, width: v.size, height: v.size, scale: 1 },
    });
    fs.writeFileSync(path.join(ICON_DIR, v.file), Buffer.from(data, 'base64'));
    console.log(`written ${v.file} (${v.size}×${v.size})`);
    await p.close();
  }
} finally {
  await browser.close();
}
