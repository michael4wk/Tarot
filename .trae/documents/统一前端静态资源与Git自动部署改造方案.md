## 改造目标
- 统一 Tarot2 前端图片资源的唯一来源目录为 `assets/images`，彻底停用 `src/assets/images` 与 `public/cards` 的运行时引用。
- 将 GitHub 前后端仓库与 Vercel 项目完全对接：推送到 Git 分支即可自动构建并部署（dev→preview，main→production）。
- 保持你在 `.env.local` 的模型与并发配置不变，前端通过后端代理调用，生产不暴露密钥。

## 资源目录与代码调整
1. 资源目录（唯一真源）：
- 卡背：`assets/images/card_back.svg`（你提供的星形紫色版本）
- 卡牌正面：`assets/images/cards/*.png`
- Logo：`assets/images/card_logo.png`
- 停用并清理：`src/assets/images`（旧/错误卡背）、`public/cards`（临时兜底目录）

2. 代码调整点：
- `src/components/RevealCard.vue`：将卡背改为 `new URL('../../assets/images/card_back.svg', import.meta.url).toString()`
- `src/utils/images.ts`：
  - 使用 `import.meta.glob('../../assets/images/cards/*.png', { eager: true, import: 'default' })`
  - 通过基础文件名（不含路径）映射资源 URL；`getCardImagePath(card)` 返回构建后的 URL，不再返回固定 `/cards/..`
- 删除所有对 `public/cards` 的引用；不再进行 Vercel rewrites（让 Vite 构建产物的哈希路径天然可用）

## 前端自动部署（Git↔Vercel）
1. Vercel 前端项目 `tarot` 设置：
- Build & Output：
  - Build Command：`git lfs install && git lfs fetch && git lfs checkout && npm ci && npm run build`
  -（目的：确保 LFS 大图在 Vercel 构建机上被拉取，而不是指针文本）
- Production Branch：`main`；Preview Branch：任何非 main 分支（含 `dev`）
- Environment Variables（Production 已验证）：保持你已设置的 `VITE_AI_*` 配置
- Aliases：`tarotpro.vercel.app` 指向最新生产部署（Git 自动部署后不需要频繁手工绑定）

2. Git 推送流程：
- 开发在 `dev` 分支，提交后自动生成 Preview 部署（用于验收）
- 你确认后合并 `dev→main`，触发 Production 部署；默认域名指向最新产物

## 后端自动部署（Git↔Vercel）
1. Vercel 后端项目 `tarot-backend` 设置：
- 当前已链接到私有仓库的 `dev` 分支；Preview 自动部署
- 环境变量（你已修正）：
  - `ALLOWED_ORIGINS=https://tarotpro.vercel.app`
  - `GEMINI_MODEL=gemini-2.0-flash`
  - 其余 `GEMINI_API_KEY/ZHIPU_API_KEY/AI_PROXY_TIMEOUT_MS/ZHIPU_MODEL` 保持
- 生产分支：待联调通过后改为 `main`（或将 Production Branch 直接设为 `main`，在你合并时触发）
- 别名：`tarotpro-backend.vercel.app` 指向最新生产部署

## 联调与验收
- Preview 环境验证：
  - 卡背请求应为构建哈希路径（由 Vite 复制的 `assets/images/card_back.svg`），显示星形紫色版本
  - 翻牌后正面请求为 `assets/<base>-<hash>.png`（Vite 构建产物），返回 200（MB 级），不再 404
- 若 Vercel 构建机未拉取 LFS 对象，图片仍为指针文本：
  - 通过日志确认后，我将把 Build Command 增加 `git lfs checkout` 前的 `git lfs fetch --all`，并在 `Install Command` 同步执行，保证对象下载
- 端到端：前端解读流程触发后端代理（Gemini/Zhipu 并发），胜者返回、败者中止，总超时 15s；输出验收报告

## 清理与一致性
- 删除 `src/assets/images/card_back.svg`（错误版本）与 `public/cards`（临时目录），避免误用；保留 `assets/images` 作为唯一真源
- `.gitattributes`：确保 `assets/images/cards/*.png` 走 LFS；避免将 `.env.local` 提交（已在 `.gitignore`）

## 风险与回退
- LFS 对象未下载导致构建产物仍为指针：已通过 Build/Install Command 保障；如仍异常，临时退回为 `public/cards` 拷贝策略（但源仍是 `assets/images`），保证线上稳定
- CDN/浏览器缓存旧脚本：使用 Preview 部署验证，生产合并后建议硬刷新或无痕访问

## 执行顺序（我来完成）
1. 调整代码引用到 `assets/images`，移除 `public/cards` 与 `rewrites`
2. 在 Vercel 前端项目设置 LFS 拉取的 Build/Install Command
3. 推送到前端 `dev` 分支，等待 Preview 构建完成并联调
4. 修复问题后合并 `dev→main`，生产自动部署并绑定别名
5. 后端同样按 `dev→main` 流转，最终将 Production Branch 设为 `main`；完成端到端验收

确认后我开始实施，并在每一步推送/部署完成后提供状态与可访问链接。