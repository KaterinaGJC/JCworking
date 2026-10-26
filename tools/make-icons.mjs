// 用本地 Chrome 把 SVG 渲染成 PNG 图标（无第三方依赖）
//
// 一套画稿 → 四个产物：
//   icon.svg                任意尺寸（圆角，桌面/PWA）
//   icon-192.png            安卓主屏常用尺寸
//   icon-512.png            商店/大图
//   icon-maskable-512.png   安卓自适应图标（内容缩到安全区，背景满幅）
//
// 风格与 App 皮肤一致：清透蓝调手账拼贴——浅蓝方格纸、撕纸便签、蝴蝶结、勾选。
import fs from 'node:fs';
import path from 'node:path';
import { launchBrowser } from './cdp.mjs';

const ICON_DIR = path.resolve('app/icons');

/* ---------------- 画稿：撕纸便签 ---------------- */

/** 生成一条"手撕"边（锯齿 + 不等振幅），返回 [x,y] 点列 */
function tornEdge(x0, y0, x1, y1, steps, amp, seed = 1) {
  const pts = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t;
    // 固定伪随机让锯齿不均匀（同一 seed 结果稳定）
    const r = Math.abs(Math.sin((i + seed) * 12.9898) * 43758.5453) % 1;
    const off = (i % 2 === 0 ? 1 : -1) * amp * (0.55 + r * 0.9);
    if (y0 === y1) pts.push([x, y + off]);
    else pts.push([x + off, y]);
  }
  return pts;
}

/** 撕纸便签的外轮廓 */
function tornNotePath(x, y, w, h) {
  const pts = [
    ...tornEdge(x, y, x + w, y, 22, 5, 1),
    ...tornEdge(x + w, y, x + w, y + h, 24, 5, 2),
    ...tornEdge(x + w, y + h, x, y + h, 22, 5, 3),
    ...tornEdge(x, y + h, x, y, 24, 5, 4),
  ];
  return `M${pts.map(([px, py]) => `${px.toFixed(1)} ${py.toFixed(1)}`).join('L')}Z`;
}

/** 蝴蝶结：两片饱满的环 + 中间结 + 两条短飘带（小尺寸下也要认得出来） */
function bow(cx, cy, s, rot = -12) {
  return `<g transform="translate(${cx} ${cy}) rotate(${rot}) scale(${s})">
    <!-- 左环 -->
    <path d="M-3 0C-9-15-30-24-41-15c-11 9-5 26 10 27C-19 12-8 8-3 0z"
          fill="#D3E4F7" stroke="#87AFD6" stroke-width="3" stroke-linejoin="round"/>
    <!-- 右环 -->
    <path d="M3 0C9-15 30-24 41-15c11 9 5 26-10 27C19 12 8 8 3 0z"
          fill="#D3E4F7" stroke="#87AFD6" stroke-width="3" stroke-linejoin="round"/>
    <!-- 飘带 -->
    <path d="M-4 6C-10 20-17 28-26 33" fill="none" stroke="#87AFD6" stroke-width="4.5" stroke-linecap="round"/>
    <path d="M4 6C10 20 17 28 26 33" fill="none" stroke="#87AFD6" stroke-width="4.5" stroke-linecap="round"/>
    <!-- 中间的结 -->
    <ellipse rx="7.5" ry="8.5" fill="#EAF3FD" stroke="#87AFD6" stroke-width="3"/>
  </g>`;
}

/** 小星星 */
function star(cx, cy, r, fill = '#F2D06B', stroke = '#D8B45E') {
  const pts = [];
  for (let i = 0; i < 10; i += 1) {
    const ang = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.45;
    pts.push([cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr]);
  }
  return `<path d="M${pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L')}Z"
    fill="${fill}" stroke="${stroke}" stroke-width="2.4" stroke-linejoin="round"/>`;
}

/**
 * 整套图标画稿
 * @param {boolean} maskable 自适应图标：背景满幅、内容缩到 78% 安全区
 */
function artwork(maskable) {
  const S = 512;
  const k = maskable ? 0.78 : 1;
  const tx = (S - S * k) / 2;
  const ty = (S - S * k) / 2;
  const notePath = tornNotePath(96, 104, 320, 320);

  const content = `
    <g transform="translate(${tx} ${ty}) scale(${k})">
      <g transform="rotate(-5 256 262)" filter="url(#soft)">
        <path d="${notePath}" fill="url(#paper)"/>
        <path d="${notePath}" fill="url(#gloss)"/>
      </g>

      <g transform="rotate(-5 256 262)" stroke="#7FA3C6" stroke-width="17"
         stroke-linecap="round" fill="none" opacity=".92">
        <path d="M152 206h168"/>
        <path d="M152 258h208"/>
        <path d="M152 310h132"/>
      </g>

      <g transform="rotate(-5 256 262)">
        <circle cx="150" cy="364" r="31" fill="#A9C9AE" stroke="#7FA98A" stroke-width="3"/>
        <path d="M135 364l10 11 19-24" fill="none" stroke="#FFFFFF" stroke-width="9.5"
              stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M198 360h106" stroke="#8FB0CF" stroke-width="14" stroke-linecap="round" opacity=".55"/>
      </g>

      ${bow(380, 140, 1.95, -14)}
      ${star(132, 152, 15)}
    </g>`;

  const radius = maskable ? 0 : 112;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" role="img" aria-label="景臣的工作生活">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#E9F3FD"/>
      <stop offset=".55" stop-color="#CFE3F7"/>
      <stop offset="1" stop-color="#AAC9EC"/>
    </linearGradient>
    <linearGradient id="paper" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFDF8"/>
      <stop offset="1" stop-color="#F6EFE3"/>
    </linearGradient>
    <linearGradient id="gloss" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity=".75"/>
      <stop offset=".45" stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>
    <pattern id="grid" width="36" height="36" patternUnits="userSpaceOnUse">
      <path d="M36 .8H.8V36" fill="none" stroke="#A8C8E8" stroke-opacity=".38" stroke-width="1.6"/>
    </pattern>
    <filter id="soft" x="-25%" y="-25%" width="150%" height="150%">
      <feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="#4A4543" flood-opacity=".20"/>
    </filter>
  </defs>

  <rect width="${S}" height="${S}" rx="${radius}" fill="url(#bg)"/>
  <rect width="${S}" height="${S}" rx="${radius}" fill="url(#grid)"/>
  ${content}
</svg>`;
}

/* ---------------- 渲染 ---------------- */

const variants = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'icon-maskable-512.png', size: 512, maskable: true },
];

const anySvg = artwork(false);
fs.writeFileSync(path.join(ICON_DIR, 'icon.svg'), `${anySvg}\n`, 'utf8');
console.log('written icon.svg');

const page = (size, svg) => `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;padding:0;width:${size}px;height:${size}px;overflow:hidden;background:transparent}
svg{display:block;width:${size}px;height:${size}px}</style></head><body>${svg}</body></html>`;

const browser = await launchBrowser();
try {
  for (const v of variants) {
    const p = await browser.newPage('about:blank');
    await p.goto('data:text/html;charset=utf-8,' + encodeURIComponent(page(v.size, artwork(v.maskable))), { waitMs: 160 });
    const { data } = await p.send('Page.captureScreenshot', {
      format: 'png',
      clip: { x: 0, y: 0, width: v.size, height: v.size, scale: 1 },
    });
    fs.writeFileSync(path.join(ICON_DIR, v.file), Buffer.from(data, 'base64'));
    console.log(`written ${v.file} (${v.size}x${v.size})`);
    await p.close();
  }
} finally {
  await browser.close();
}
