// 给设计稿截图：430×932，DSF 2
import fs from 'node:fs';
import path from 'node:path';
import { startServer } from '../tools/server.mjs';
import { launchBrowser } from '../tools/cdp.mjs';

const ROOT = path.resolve('设计/v3-复古风格');
const OUT = path.join(ROOT, '截图');
fs.mkdirSync(OUT, { recursive: true });

const server = await startServer(ROOT, 0);
const browser = await launchBrowser();
const pages = ['home', 'plan', 'schedule', 'post', 'settings'];

try {
  const page = await browser.newPage('about:blank');
  await page.send('Emulation.setDeviceMetricsOverride', {
    width: 430, height: 932, deviceScaleFactor: 2, mobile: true,
  });
  for (const p of pages) {
    await page.goto(`${server.url}/预览.html#/${p}`);
    await new Promise((r) => setTimeout(r, 350));
    await page.screenshot(path.join(OUT, `${p}.png`));
    console.log('shot', p);
  }
  // 深色版（如果做了）——这里先只导浅色
  await page.close();
} finally {
  await browser.close();
  await server.close();
}
