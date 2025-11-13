## 敏感文件排除
- 已检查前端 `.gitignore`（含 `.env*` 且排除 `.env.example` 保留模板），`/.env.local` 不会被推送。
- 后端同样不创建任何密钥文件；密钥仅在 Vercel 环境变量中配置。

## 前端（Tarot）推送与部署
1) 目录：`/Users/michael/Documents/Code/Trae/Tarot2`
2) 推送到 GitHub（如已推送将自动跳过）：
   - `git init`
   - `git remote add origin https://github.com/michael4wk/Tarot.git`
   - `git branch -M main`
   - `git add . && git commit -m "feat: init tarot frontend"`
   - `git push -u origin main`
3) Vercel 项目：链接与环境变量（非交互，用 `--token`）：
   - `vercel link --project tarot --token <TOKEN> --yes`
   - 添加到 Production 与 Preview：
     - `VITE_AI_DEV_PROXY=0`
     - `VITE_AI_BASE_URL=https://tarot-backend.vercel.app`
     - `VITE_ENABLE_AI_READING=true`
     - `VITE_AI_HEDGE_ENABLED=true`
     - `VITE_AI_HEDGE_DELAY_MS=0`
     - `VITE_AI_ABORT_LOSER=1`
     - `VITE_AI_HEDGE_LOG_LEVEL=warn`
     - `VITE_GEMINI_MODEL=gemini-2.0-flash`
   - 构建与发布：`npm ci && npm run build && vercel --prod --token <TOKEN>`
   - 记录域名：`https://tarot.vercel.app`

## 后端（Tarot-backend）初始化与部署
1) 目录：`/Users/michael/Documents/Code/Trae/Tarot-backend`
2) 创建 Serverless 路由文件并初始化仓库：
   - 新增 `api/ai/gemini/generate.js` 与 `api/ai/zhipu.js`（仅转发与超时，保持 JSON 返回）
   - `git init`
   - `git remote add origin https://github.com/michael4wk/Tarot-backend.git`
   - `git branch -M main`
   - `git add . && git commit -m "feat(api): add gemini and zhipu serverless routes"`
   - `git push -u origin main`
3) Vercel 后端项目：链接与环境变量：
   - `vercel link --project tarot-backend --token <TOKEN> --yes`
   - 添加到 Production 与 Preview：
     - `GEMINI_API_KEY=<取自 /.env.local 的 VITE_GEMINI_API_KEY>`
     - `ZHIPU_API_KEY=<取自 /.env.local 的 VITE_ZHIPU_API_KEY>`
     - `AI_PROXY_TIMEOUT_MS=15000`
     - `GEMINI_MODEL=gemini-2.0-flash`
     - `ALLOWED_ORIGINS=https://tarot.vercel.app`
   - 发布：`vercel --prod --token <TOKEN>`
   - 记录域名：`https://tarot-backend.vercel.app`

## 联调与验收
- 打开 `https://tarot.vercel.app`：点击“开始解读”应并发调用后端的 `/api/ai/gemini/generate` 与 `/api/ai/zhipu`，胜者优先、败者根据配置被中止，总超时回退 Mock；抽牌与图片映射正常。

## 我现在将开始执行以上命令；你只需在 CLI 提示时提供 `<TOKEN>` 或提前 `export VERCEL_TOKEN='<TOKEN>'`。