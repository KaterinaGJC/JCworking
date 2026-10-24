# 推送到 GitHub 教程（Windows · 从零开始）

> 目标：把这套代码放到 GitHub，并打开 Pages，让手机能通过 `https://…` 地址安装成 App。
> 全程大约 **8 分钟**，只有第一次需要做。

---

## 先看全景：一共三步

```
① 网页上建一个空仓库        （2 分钟，只需点几下）
② 电脑上推代码上去          （3 条命令，第一次要登录 GitHub）
③ 仓库设置里打开 Pages      （点两下，等 1 分钟）
```

**本地我已经帮你准备好了**：`git` 仓库已初始化、65 个文件已暂存、换行符策略已配好。
你不需要再做 `git init` 和 `git add`。

---

## 第 0 步：确认你有 GitHub 账号

- 有 → 打开 [github.com](https://github.com) 登录，记住右上角头像旁的用户名（后面要用）
- 没有 → [github.com/signup](https://github.com/signup) 注册（邮箱 + 密码 + 用户名，一分钟）

> 用户名建议用英文；它会出现在最终网址里，比如用户名 `jc` → `https://jc.github.io/app/…`

---

## 第 1 步：建一个空仓库

1. 登录后，点右上角 **＋** → **New repository**
2. 填写：

   | 字段 | 填什么 |
   |---|---|
   | **Repository name** | 英文名，例如 `jc-life`（不能有中文和空格） |
   | **Description** | 随便写，可不填 |
   | **Public / Private** | 选 **Public**（免费版 Pages 必须公开） |
   | Add a README file | **不要勾** |
   | Add .gitignore | **不要勾** |
   | Choose a license | **不要勾** |

   > ⚠️ 那三个勾选框千万别勾。勾了会在远端先有文件，你推的时候会报 `rejected`，得多绕一步。

3. 点 **Create repository**
4. 建好后页面会显示一段 Quick setup，复制 HTTPS 那个地址，长这样：
   ```
   https://github.com/你的用户名/jc-life.git
   ```

---

## 第 2 步：告诉 Git 你是谁（只需一次）

打开「开始菜单」搜 **PowerShell**，粘贴下面两行（把内容换成你自己的）：

```powershell
git config --global user.name "你的名字或昵称"
git config --global user.email "你的GitHub邮箱"
```

> **邮箱填哪个？** 建议用 GitHub 提供的匿名邮箱，不暴露真实邮箱：
> GitHub → 右上头像 → Settings → Emails → 勾上 *Keep my email addresses private*，
> 页面会显示一个 `12345678+用户名@users.noreply.github.com` 形式的地址，填它。

---

## 第 3 步：提交并推送（关键的 3 条命令）

在 PowerShell 里**逐行**粘贴：

```powershell
cd "F:\景臣的课表app"
```

```powershell
git commit -m "v1.0 景臣的工作生活 App"
```

```powershell
git remote add origin https://github.com/你的用户名/jc-life.git
```

> ↑ 把 `你的用户名/jc-life` 换成第 1 步实际的名字。

```powershell
git push -u origin main
```

**接下来会发生什么：**

- 弹出一个浏览器窗口，让你 **Sign in to GitHub** → 点 **Authorize** 授权
- 浏览器显示 "You're all set"，关掉窗口
- PowerShell 里出现一堆 `Writing objects...` 之类，最后回到可输入状态 = 成功

> 登录一次就够了，以后推代码不用再登录（凭据已存在 Windows 凭据管理器里）。

**如果没弹窗，而是在命令行里让你输入 `Username` / `Password`：**
用户名填 GitHub 用户名，**密码处粘贴 Personal Access Token**（不是登录密码！）：
GitHub → Settings → Developer settings → Personal access tokens → **Tokens (classic)** →
Generate new token → 勾选 **`repo`** → 生成后立刻复制那串 `ghp_...`（只显示一次）。

---

## 第 4 步：打开 Pages（让网址生效）

1. 进入你的仓库页面
2. 点顶部 **Settings**（齿轮）
3. 左侧栏找到 **Pages**
4. **Build and deployment** 区域：
   - **Source** 选 **Deploy from a branch**
   - **Branch** 选 **`main`**，右边文件夹选 **`/ (root)`**
   - 点 **Save**
5. 等 **1～2 分钟**，刷新这个页面，顶部会出现一行绿底提示：
   ```
   Your site is live at https://你的用户名.github.io/jc-life/
   ```

**你的应用地址**（注意结尾的 `app/index.html`）：

```
https://你的用户名.github.io/jc-life/app/index.html
```

> 想让地址更短（直接 `/jc-life/` 就能打开）也行，需要调整目录结构，属于可选优化——当前结构是验证过的，不改完全没问题。

---

## 第 5 步：装到手机上

1. 手机 **Chrome** 打开上面那个 `app/index.html` 的地址
2. 右上角 **⋮** → **安装应用**（有的版本显示「添加到主屏幕」）
3. 桌面上出现图标 → 点开就是全屏 App

**验证三件事：**
- 打开后没有地址栏 ✅
- 开**飞行模式**再点图标，还能打开、还能记东西 ✅
- 关掉浏览器重开，之前记的东西还在 ✅

---

## 以后改了代码怎么更新（3 条命令）

```powershell
cd "F:\景臣的课表app"
git add -A
git commit -m "这次改了什么"
git push
```

手机上下拉刷新一次，Service Worker 会在后台把新版本缓存下来，再打开就是新的。

---

## 常见报错对照表

| 你看到的提示 | 原因 | 怎么办 |
|---|---|---|
| `remote: Permission to … denied` / `403` | 登录的账号不是仓库所有者，或旧凭据残留 | 控制面板 → 凭据管理器 → Windows 凭据 → 删掉所有 `git:https://github.com` → 重新 `git push` |
| `Authentication failed` | 用了账号密码（GitHub 早就不支持） | 改用 Token（见第 3 步下方） |
| `! [rejected] main -> main (fetch first)` | 建仓库时勾了 README 之类，远端已有内容 | 先 `git pull --rebase origin main`，再 `git push` |
| `fatal: not a git repository` | 当前不在项目目录 | 先执行 `cd /d F:\景臣的课表app` |
| `src refspec main does not match any` | 还没提交 | 先执行 `git commit -m "..."` |
| `remote: Support for password authentication was removed` | 同 Authentication failed | 用 Token 或让弹窗登录 |
| 页面打开是 **404** | Pages 没构建完，或地址少了 `app/index.html` | 等 2 分钟；确认地址是 `…/仓库名/app/index.html` |
| 页面能开但**图标是白的** | 图标没上传 | 确认 `app/icons/` 三个 png 在仓库里 |
| `LF will be replaced by CRLF` 警告 | 换行符提示，不是错误 | 已经配了 `.gitattributes`，可以忽略 |

---

## 关于「公开仓库」你该知道的

- 免费版 Pages 要求仓库 **Public**，也就是别人能看到**代码**
- 但仓库里**没有任何你的数据**：便签、课表、学生姓名都只存在你手机浏览器的 IndexedDB 里
- 别人拿到代码，也看不到你记了什么 —— 数据从来没离开过手机

如果你以后确实需要一个私有仓库，可以改用 **Cloudflare Pages**（同样免费、支持私有仓库、同样 https），把 `app/` 目录拖进去即可，第 4、5 步的用法完全一样。

---

## 一次性检查清单

推完之后对着勾一遍：

- [ ] GitHub 仓库首页能看到 `app`、`tests`、`PRD.md` 等目录
- [ ] 仓库里 `app/index.html` 点开能看到代码
- [ ] Settings → Pages 显示绿色 "Your site is live"
- [ ] 电脑浏览器打开 `https://…/app/index.html` 能正常显示首页
- [ ] 手机 Chrome 打开同一地址，能「安装应用」
- [ ] 飞行模式下 App 仍能打开
- [ ] 立刻进设置页「导出备份文件」一次（养成习惯）
- [ ] 正式使用前，设置页「清空所有数据」（清掉测试数据）
