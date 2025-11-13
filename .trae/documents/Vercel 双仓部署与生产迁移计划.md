## 总体目标
- 在 Vercel 新建两个项目：前端 `tarot`（Public 仓库）与后端 `tarot-backend`（Private 仓库）。
- 保持开发环境的两路并发竞速逻辑与体验，在生产通过后端路由持密钥实现。

## 方案A：Vercel UI 手动创建（推荐）
- 前置准备：确保你已登录 Vercel（账户 `michael4wk@qq.com`）并已连接 GitHub。默认团队为 `michael4wk's-projects (hobby)`。

### 步骤 1：创建前端项目 `tarot`
1) 打开 Vercel Dashboard → New Project → Import Git Repository。
2) 选择仓库：`michael4wk/Tarot`。
3) 项目名设置为 `tarot`（保持用户要求）。
4) 配置框架与构建：
   - Framework 自动识别为 Vite。
   - Build Command：`npm run build`。
   - Output Directory：`dist`。
5) 环境变量（Environment Variables → Add）：在 “Production” 与 “Preview” 环境都添加：
   - `VITE_AI_DEV_PROXY=0`
   - `VITE_AI_BASE_URL=https://tarot-backend.vercel.app`（后续如绑定自定义域名再改）
   - `VITE_ENABLE_AI_READING=true`
   - `VITE_AI_HEDGE_ENABLED=true`
   - `VITE_AI_HEDGE_DELAY_MS=0`
   - `VITE_AI_ABORT_LOSER=1`
   - `VITE_AI_HEDGE_LOG_LEVEL=warn`
   - `VITE_GEMINI_MODEL=gemini-2.0-flash`
   - 不要添加任何密钥（不要设置 `VITE_GEMINI_API_KEY`、`VITE_ZHIPU_API_KEY`）。
6) Create → Deploy。完成后记录默认域名：例如 `https://tarot.vercel.app`。

### 步骤 2：创建后端项目 `tarot-backend`
1) Vercel Dashboard → New Project → Import Git Repository。
2) 选择仓库：`michael4wk/Tarot-backend`。
3) 项目名建议 `tarot-backend`。
4) 路由实现方式：该仓库需包含 Serverless 函数：
   - `api/ai/gemini/generate.(ts|js)`：将请求体转发到 Google Generative Language API，带超时与错误体预览。
   - `api/ai/zhipu.(ts|js)`：将请求体转发到 `open.bigmodel.cn/api/paas/v4/chat/completions`，带超时与错误体预览。
   - 若当前仓库尚未包含上述代码，我稍后按你的授权补齐，保持与本地代理中间件一致的行为。
5) 环境变量（Environment Variables → Add）：在 “Production” 与 “Preview” 环境都添加：
   - `GEMINI_API_KEY=<将 .env.local 中 VITE_GEMINI_API_KEY 的真实值粘贴到此处>`
   - `ZHIPU_API_KEY=<将 .env.local 中 VITE_ZHIPU_API_KEY 的真实值粘贴到此处>`（如要保留两路并发）
   - `AI_PROXY_TIMEOUT_MS=15000`
   - `GEMINI_MODEL=gemini-2.0-flash`
   - `ALLOWED_ORIGINS=https://tarot.vercel.app`
6) Create → Deploy。完成后记录默认域名：如 `https://tarot-backend.vercel.app`。

### 步骤 3：联调与验证
1) 前端环境变量里的 `VITE_AI_BASE_URL` 指向后端默认域名（已设置为 `https://tarot-backend.vercel.app`）。
2) 打开 `https://tarot.vercel.app`，进行以下验证：
   - 抽牌与缓存：正常加载 78 张卡，网络异常时回退本地并缓存。
   - 结果页解读：点击“开始解读”，两路并发请求出现于 Network（`/api/ai/gemini/generate` 与 `/api/ai/zhipu`）。
   - 胜者选择与败者中止：根据 `abortLoser` 设置，胜者确定后另一条请求被取消或继续直至返回（logLevel 为 warn 时仅输出关键告警）。
   - 总超时与降级：在网络干扰或配额异常时，回退到本地 Mock，用户体验保持一致。

## 方案B：Vercel CLI（可选）
- 需要你在终端执行并登录：
1) 安装：`npm i -g vercel`
2) 登录：`vercel login`（用 `michael4wk@qq.com`）
3) 前端目录（Tarot 仓库）执行：
   - `vercel link`（绑定到 team：`michael4wk's-projects`，项目名填 `tarot`）
   - `vercel env add` 逐项添加前端环境变量（Production 与 Preview 环境各添加一次）
   - `vercel --prod`
4) 后端目录（Tarot-backend 仓库）执行：
   - `vercel link`（项目名 `tarot-backend`）
   - `vercel env add GEMINI_API_KEY production`
   - `vercel env add ZHIPU_API_KEY production`
   - 依次添加其他变量：`AI_PROXY_TIMEOUT_MS`、`GEMINI_MODEL`、`ALLOWED_ORIGINS`
   - `vercel --prod`

## 我来执行（需要你的授权）
- 我可以：
  - 在 `tarot-backend` 私仓中补齐 `api/ai/gemini/generate` 与 `api/ai/zhipu` 函数（与本地代理逻辑一致）。
  - 通过 Vercel CLI 完成两项目创建与环境变量配置。
- 你需要：
  - 授权我使用你的 Vercel 账户或在 UI 完成项目创建并提供后端域名；我即可继续联调前端并出具验证报告。

## 成功标准
- 生产前端仅调用后端路由，不在浏览器暴露任何密钥。
- 并发竞速保持与开发一致（`delay=0` 同时起跑，胜者优先，配置可中止败者）。
- 网络异常与配额边界下，保持优雅降级与稳定体验。