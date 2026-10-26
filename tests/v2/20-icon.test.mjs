// 验证项 20：桌面图标（PWA 图标）——尺寸、格式、maskable、与皮肤风格同源
import { bootApp, shutdownApp, freshPage, ok, eq, report } from '../lib.mjs';

let exitCode = 1;
try {
  await bootApp();
  const page = await freshPage();

  // 1) 三个 PNG 都能取到，且实际像素尺寸正确（不是「文件名叫 192 其实 252」）
  const png = await page.eval(`(async () => {
    const read = async (p) => {
      const r = await fetch(p);
      if (!r.ok) return { ok: false, status: r.status };
      const buf = new Uint8Array(await r.arrayBuffer());
      const dv = new DataView(buf.buffer);
      // PNG: 89 50 4E 47 ... IHDR 宽在 16，高在 20
      return {
        ok: true,
        bytes: buf.length,
        isPng: buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47,
        w: dv.getUint32(16),
        h: dv.getUint32(20),
      };
    };
    return {
      i192: await read('/icons/icon-192.png'),
      i512: await read('/icons/icon-512.png'),
      mask: await read('/icons/icon-maskable-512.png'),
    };
  })()`);

  ok('192 图标可访问', png.i192.ok === true, JSON.stringify(png.i192));
  eq('192 图标真的是 192×192', `${png.i192.w}x${png.i192.h}`, '192x192');
  ok('512 图标真的是 512×512', png.i512.w === 512 && png.i512.h === 512, JSON.stringify(png.i512));
  ok('maskable 图标真的是 512×512', png.mask.w === 512 && png.mask.h === 512, JSON.stringify(png.mask));
  ok('都是真正的 PNG（不是改后缀）', png.i192.isPng && png.i512.isPng && png.mask.isPng);

  // 2) manifest 里三种用途齐全
  const man = await page.eval(`(async () => {
    const m = await (await fetch('/manifest.webmanifest')).json();
    return { icons: m.icons, theme: m.theme_color, bg: m.background_color, display: m.display };
  })()`);
  eq('manifest 有 3 个图标', man.icons.length, 3);
  ok('含 maskable 用途（安卓自适应图标）',
    man.icons.some((i) => String(i.purpose).includes('maskable')), JSON.stringify(man.icons.map((i) => i.purpose)));
  ok('含 192 与 512 两个尺寸',
    man.icons.some((i) => i.sizes === '192x192') && man.icons.some((i) => i.sizes === '512x512'));
  ok('主题色与手账风底色一致（浅灰蓝系）',
    /^#F[0-9A-F]F[0-9A-F]F/i.test(man.theme) || man.theme.toUpperCase() === '#F0F4F8', man.theme);

  // 3) SVG 源文件在手，且是 512 画布、含撕纸轮廓（多边形点多）
  const svg = await page.eval(`(async () => (await fetch('/icons/icon.svg')).text())()`);
  ok('icon.svg 存在且是 SVG', svg.includes('<svg') && svg.includes('viewBox="0 0 512 512"'));
  const points = (svg.match(/\d+\.\d+ \d+\.\d+/g) || []).length;
  ok('撕纸边是多边形（点数 > 80，不是直角矩形）', points > 80, String(points));

  await page.close();
  exitCode = report('验证项 20 · 桌面图标');
} catch (err) {
  console.error('测试异常：', err);
  exitCode = 1;
} finally {
  await shutdownApp();
}
process.exit(exitCode);
