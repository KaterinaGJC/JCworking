// 一键跑全部测试：单元 + 每个里程碑 + 全量验收 + 子目录部署 + v2 的逐项修复测试
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// v2 目录下每修一个问题就多一个测试文件，自动纳入全量运行
const v2Files = fs.existsSync('tests/v2')
  ? fs.readdirSync('tests/v2').filter((f) => f.endsWith('.test.mjs')).sort()
  : [];

const SUITES = [
  ['单元测试（日期/重复/摘要/备份）', ['--test', 'tests/unit/core.test.mjs']],
  ['M0 骨架与可安装', ['tests/m0.test.mjs']],
  ['M1 数据层与设置', ['tests/m1.test.mjs']],
  ['M2 今日计划', ['tests/m2.test.mjs']],
  ['M3 快速备忘', ['tests/m3.test.mjs']],
  ['M4 游戏娱乐', ['tests/m4.test.mjs']],
  ['M5 教培课表', ['tests/m5.test.mjs']],
  ['M6 首页聚合', ['tests/m6.test.mjs']],
  ['M7 打磨与性能', ['tests/m7.test.mjs']],
  ['全量验收 A–I', ['tests/acceptance.test.mjs']],
  ['子目录部署（GitHub Pages 形态）', ['tests/subpath.test.mjs']],
  ...v2Files.map((f) => [`v2 · ${path.basename(f, '.test.mjs')}`, [`tests/v2/${f}`]]),
];

const results = [];
const startedAt = Date.now();

for (const [name, args] of SUITES) {
  console.log(`\n${'='.repeat(60)}\n▶ ${name}\n${'='.repeat(60)}`);
  const t0 = Date.now();
  const r = spawnSync(process.execPath, args, { stdio: 'inherit' });
  const ms = Date.now() - t0;
  const passed = r.status === 0;
  results.push({ name, passed, ms, code: r.status });
}

const total = results.length;
const passed = results.filter((r) => r.passed).length;

console.log(`\n${'='.repeat(60)}\n汇总\n${'='.repeat(60)}`);
for (const r of results) {
  console.log(`${r.passed ? '  ✅' : '  ❌'} ${r.name}  (${(r.ms / 1000).toFixed(1)}s)`);
}
console.log(`\n${passed}/${total} 个测试套件通过，总耗时 ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);

process.exit(passed === total ? 0 : 1);
