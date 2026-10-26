import { launchBrowser } from "./cdp.mjs";
const URL = "https://katerinagjc.github.io/MY-own-job/app/index.html";
const b = await launchBrowser();
const p = await b.newPage("about:blank");
await p.send("Emulation.setDeviceMetricsOverride", { width: 430, height: 932, deviceScaleFactor: 2, mobile: true });
const errs = [];
p.on((m) => { if (m.method === "Runtime.exceptionThrown") errs.push(m.params.exceptionDetails?.text || "exception"); });
await p.send("Runtime.enable");
await p.goto(URL);
await p.waitFor("document.querySelector('.home-body') !== null", { timeout: 25000, message: "首页" });
await new Promise(r => setTimeout(r, 1700));
const r = await p.eval(`(() => {
  const card = document.querySelector('.home-body > .card');
  const cs = card ? getComputedStyle(card) : null;
  return JSON.stringify({
    splashGone: !document.getElementById('splash'),
    clipPath: cs ? cs.clipPath.slice(0, 30) : null,
    paper: cs ? cs.backgroundColor : null,
    rotated: cs ? cs.transform : null,
    bodyBg: getComputedStyle(document.body).backgroundColor,
    grid: getComputedStyle(document.body).backgroundImage.includes("repeating-linear-gradient"),
    tabs: document.querySelectorAll('#tabbar .tab').length
  });
})()`);
console.log(r);
await p.screenshot("F:/景臣的课表app/设计/手账风/截图/线上真机.png");
console.log("console errors:", errs.length);
await b.close();
