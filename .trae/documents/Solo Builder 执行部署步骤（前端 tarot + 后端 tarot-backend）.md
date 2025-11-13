## 前置准备
- 确认本地已安装并能使用 Vercel CLI：`npm i -g vercel`
- 生成并设置令牌：在浏览器创建 token 后本机执行 `export VERCEL_TOKEN="<你的令牌>"`
- Team 作用域：`michael4wk's-projects (hobby)`（如需 CLI 指定 `--scope <team-slug>`）

## 前端（Tarot）
- 目录：`/Users/michael/Documents/Code/Trae/Tarot2`
- 关联项目：`vercel link --project tarot --scope <team-slug> --token "$VERCEL_TOKEN" --yes`
- 设置环境变量（Production 与 Preview 都添加一次）：
  - `VITE_AI_DEV_PROXY=0`
  - `VITE_AI_BASE_URL=https://tarot-backend.vercel.app`
  - `VITE_ENABLE_AI_READING=true`
  - `VITE_AI_HEDGE_ENABLED=true`
  - `VITE_AI_HEDGE_DELAY_MS=0`
  - `VITE_AI_ABORT_LOSER=1`
  - `VITE_AI_HEDGE_LOG_LEVEL=warn`
  - `VITE_GEMINI_MODEL=gemini-2.0-flash`
- 构建并发布：`npm ci && npm run build && vercel --prod --token "$VERCEL_TOKEN"`
- 产出：预期 `https://tarot.vercel.app`

## 后端（Tarot-backend）
- 目录：`/Users/michael/Documents/Code/Trae/Tarot2/Tarot-backend`
- 如果未克隆：`git clone https://github.com/michael4wk/Tarot-backend.git /Users/michael/Documents/Code/Trae/Tarot2/Tarot-backend`
- 关联项目：`vercel link --project tarot-backend --scope <team-slug> --token "$VERCEL_TOKEN" --yes`
- 设置环境变量（Production 与 Preview 都添加一次）：
  - `GEMINI_API_KEY=<你的 .env.local 的 VITE_GEMINI_API_KEY 原值>`
  - `ZHIPU_API_KEY=<你的 .env.local 的 VITE_ZHIPU_API_KEY 原值>`
  - `AI_PROXY_TIMEOUT_MS=15000`
  - `GEMINI_MODEL=gemini-2.0-flash`
  - `ALLOWED_ORIGINS=https://tarot.vercel.app`
- 若仓库未含路由文件，我将新增（与开发代理一致的转发逻辑）：
  - `api/ai/gemini/generate.ts`
  - `api/ai/zhipu.ts`
- 发布：`vercel --prod --token "$VERCEL_TOKEN"`
- 产出：预期 `https://tarot-backend.vercel.app`

## 联调验证
- 前端 Network 仅出现 `${VITE_AI_BASE_URL}/api/ai/gemini/generate` 与 `/api/ai/zhipu`。
- 并发：`VITE_AI_HEDGE_ENABLED=true`、`VITE_AI_HEDGE_DELAY_MS=0` 同时起跑，胜者优先；`VITE_AI_ABORT_LOSER=1` 败者被中止。
- 总超时与降级：按 `VITE_AI_TIMEOUT_MS` 回退到本地 Mock；卡组缓存与图片映射正常。

## 你的配合
- 提供/设置 `VERCEL_TOKEN` 到本机环境。
- 确认 team slug（或我执行 CLI 查询后填入）。
- 若后端目录为空，我将从 GitHub 仓库拉取后按上述步骤部署并补齐路由。