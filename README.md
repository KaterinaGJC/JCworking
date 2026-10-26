# 景臣的工作生活

一个人的手机应用：今日计划、教培课表、游戏娱乐、快速备忘。
装到安卓手机桌面后**完全离线可用**，数据只存在手机本地，不联网、不登录、不上传。

> 产品与需求：[PRD.md](PRD.md) ｜ 执行计划：[开发计划.md](开发计划.md) ｜ 设计与原型：[设计/页面结构与交互.md](设计/页面结构与交互.md)、[原型/index.html](原型/index.html)

---

## 目录结构

```
app/                  发布用的全部内容（只有这个目录需要部署）
├─ index.html         入口
├─ manifest.webmanifest
├─ sw.js              Service Worker（离线缓存）
├─ icons/             图标（SVG 源 + 192/512/maskable PNG）
├─ css/               tokens.css（设计令牌）· base.css（组件）· pages.css（页面）
└─ js/
   ├─ main.js         启动
   ├─ router.js       hash 路由
   ├─ db.js           IndexedDB 封装
   ├─ store.js        内存状态 + 变更通知
   ├─ backup.js       快照 / 导出 / 导入 / 清空
   ├─ theme.js        深浅色
   ├─ tips.js         首次使用说明卡
   ├─ dev.js          测试数据生成器
   ├─ core/           纯逻辑（日期 / 重复规则 / 摘要 / 备份格式），可被 Node 直接单测
   └─ pages/          九个页面模块
tools/                开发工具（静态服务器 / CDP 驱动 / 图标与截图生成）
tests/                单元测试 + 每个里程碑的端到端测试 + 全量验收
```

## 本地预览

双击 `start.bat`，或：

```bash
node tools/server.mjs app 8123
# 打开 http://127.0.0.1:8123
```

## 部署到 GitHub Pages（只做一次）

1. 在 GitHub 新建仓库（公开仓库即可，**仓库里只有代码，不含任何个人数据**）
2. 把本目录推送上去
3. 仓库 → Settings → Pages → Source 选 `Deploy from a branch`，分支 `main`、目录 `/ (root)`，保存
4. 等 1 分钟，得到 `https://katerinagjc.github.io/JCworking/`（本项目实际地址）
5. 手机 Chrome 打开这个地址 → 菜单 →「添加到主屏幕」/「安装应用」

> 应用全部使用相对路径，部署在子目录下也能正常工作（有专门的测试 `tests/subpath.test.mjs` 验证）。
> 之后改版：重新推送即可，手机端刷新后自动更新（Service Worker 缓存带版本）。

## 测试

```bash
node tests/run-all.mjs        # 全部：单元 + M0~M7 + 全量验收 + 子目录部署
node --test tests/unit/core.test.mjs   # 只跑单元测试
node tests/m5.test.mjs        # 只跑某一个里程碑
```

测试是**真浏览器**驱动的（Chrome/Edge + CDP，零第三方依赖）：会真的点按钮、真的断网、真的重启页面后查 IndexedDB。

## 数据与备份

- 数据存在浏览器 IndexedDB（库名 `jc-life`），每次改动即时落库
- 每天首次打开自动留一份快照，保留最近 7 天
- 设置页可「导出备份文件」（`景臣备份-YYYYMMDD-HHmm.json`）与「从文件导入」（覆盖 / 合并）
- 换手机或清理浏览器前，务必先导出

## 技术选择

原生 HTML/CSS/ES Modules，**零依赖、零构建**：不需要 npm install，不需要打包，改一行刷新即生效。
部署产物就是 `app/` 这一堆静态文件。
