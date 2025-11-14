## 问题根因（来自构建日志）
- 日志显示：`batch request: missing protocol: ""` → `error: failed to fetch some objects from ''`，随后大量 `Skipped checkout ... content not local. Use fetch to download`。
- 说明 Vercel 构建机并未成功从 Git LFS 下载图片对象，导致构建时所有图片都以 0.13k 的指针文本进入 `dist/assets`，浏览器无法显示 Logo、卡背、卡面。
- 触发原因：我们在 `build` 脚本使用了 `git lfs fetch --all`/`checkout`，在 Vercel 的临时构建环境里未指定远程，导致 LFS 执行失败。

## 修复方案（前端项目设置）
1. 在 Vercel 前端项目 `tarot` 的 Build & Output Settings 中，调整构建命令为：
- Install Command：
```
git lfs install && \
  git lfs pull origin $VERCEL_GIT_COMMIT_REF --include='assets/images/**' || \
  git lfs pull --include='assets/images/**' || true
```
- Build Command：
```
npm ci && npm run build
```
- 解释：
  - 使用 `git lfs pull origin $VERCEL_GIT_COMMIT_REF` 针对当前分支从远程拉取 LFS 对象；失败时退回 `git lfs pull`。
  - 限定 `--include='assets/images/**'`，仅下载我们需要的图片对象，提高稳定性。

2. 保持我们已统一的代码引用（无需再改代码）：
- 卡背：`new URL('../../assets/images/card_back.svg', import.meta.url).toString()`
- 卡面：`import.meta.glob('../../assets/images/cards/*.png', { eager: true, import: 'default' })` 返回构建 URL
- Logo：`new URL('../../assets/images/card_logo.png', import.meta.url).toString()`

3. 重新触发 Preview 构建并验证：
- 在 `Deployments` 中查看新 Preview，打开构建日志确认有 `git lfs pull ...` 执行成功
- 验证 `dist/assets/*` 图片大小不再是 0.13 kB（应为 MB 级）
- 页面硬刷新：Logo、卡背、翻牌正面全部正常显示

## 可能的备选与兜底（仅在 LFS 拉取仍失败时启用）
- 备选 A（构建脚本兜底）：将 `npm run build` 内的 LFS 命令改为 `git lfs pull origin $VERCEL_GIT_COMMIT_REF --include='assets/images/**'`，避免使用 `fetch --all`；同时保留 Install Command 的拉取，双重保障。
- 备选 B（CDN 兜底）：临时将图片复制到 `public/cards` 并使用固定路径引用；源仍保留在 `assets/images`，待 LFS 稳定后再切回构建 URL（不推荐优先使用）。

## 验收
- 构建日志无 `missing protocol`/`Skipped checkout ... content not local`
- dist 中图片为真实二进制，浏览器显示正常
- 端到端抽牌并发逻辑不变，后端联调后最终合并 `dev→main` 进入 Production 自动部署

请确认后，我将按以上步骤调整前端项目的 Vercel 构建设置并重新触发 Preview 构建，随后给你验证链接与结果。