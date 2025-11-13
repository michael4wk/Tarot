## 两种模式说明
- Solo Builder：我在你的本地/IDE内以你的身份操作 GitHub/Vercel（用你登录的凭据），无需把我添加为 GitHub 协作者或 Vercel 成员。
- 协作者模式：我用自己的账号操作你的仓库/团队，需要你在 GitHub/Vercel授予权限。你无需此模式即可完成部署。

## 前置确认
- 你在 IDE/终端里已登录 GitHub（能推送到 `Tarot` 与 `Tarot-backend`）和 Vercel（或可登录）。
- 本地前端路径：`/Users/michael/Documents/Code/Trae/Tarot2`（已存在）
- 本地后端路径：若未克隆，请准备一个本地目录（例如 `~/Code/Tarot-backend`）或告诉我使用 GitHub 直接连接部署。

## 我将按 Solo Builder 执行的步骤
1) 安装/登录 Vercel CLI：`npm i -g vercel` → `vercel login`（选择 team：`michael4wk's-projects (hobby)`）
2) 前端项目链接与创建：在 `Tarot2` 目录执行 `vercel link`，项目名填 `tarot`，选择 team。
3) 前端环境变量写入（Production/Preview）：
   - `VITE_AI_DEV_PROXY=0`
   - `VITE_AI_BASE_URL=https://tarot-backend.vercel.app`
   - `VITE_ENABLE_AI_READING=true`
   - `VITE_AI_HEDGE_ENABLED=true`
   - `VITE_AI_HEDGE_DELAY_MS=0`
   - `VITE_AI_ABORT_LOSER=1`
   - `VITE_AI_HEDGE_LOG_LEVEL=warn`
   - `VITE_GEMINI_MODEL=gemini-2.0-flash`
4) 前端构建并部署：`npm ci && npm run build && vercel --prod`，记录域名 `https://tarot.vercel.app`。
5) 后端项目链接与创建：在后端本地目录执行 `vercel link`，项目名填 `tarot-backend`，选择 team。
6) 后端环境变量写入（Production/Preview）：
   - `GEMINI_API_KEY=<从 .env.local 拷贝的 VITE_GEMINI_API_KEY>`
   - `ZHIPU_API_KEY=<从 .env.local 拷贝的 VITE_ZHIPU_API_KEY>`
   - `AI_PROXY_TIMEOUT_MS=15000`
   - `GEMINI_MODEL=gemini-2.0-flash`
   - `ALLOWED_ORIGINS=https://tarot.vercel.app`
7) 后端路由实现（若仓库未包含）：新增 `api/ai/gemini/generate.ts` 与 `api/ai/zhipu.ts`（与本地代理一致的转发、超时与错误体预览），提交并部署：`vercel --prod`，记录域名 `https://tarot-backend.vercel.app`。
8) 联调验证：前端 `VITE_AI_BASE_URL` 生效、并发两路起跑、胜者优先、败者按配置中止、总超时回退与图片映射/卡组缓存正确。

## 你需要的最小配合
- 在 IDE 终端允许我登录 Vercel（或提供 `VERCEL_TOKEN`），并确认 team。
- 若后端本地目录未准备，请告诉我使用“直接连接 GitHub 仓库创建项目”的方式，仍可由 CLI 完成。

## 交付
- 我将完成创建与配置、部署与联调，并给出验证报告与参数微调建议，确保生产与开发并发体验一致。