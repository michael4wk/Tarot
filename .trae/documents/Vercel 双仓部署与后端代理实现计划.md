## 目标
- 完成“前端公开仓库 + 后端私有仓库”的双仓部署到 Vercel（Hobby），保留并验证 Hedge 并发竞速逻辑。
- 前端产线不注入任何敏感密钥；所有 AI 调用经由后端 Serverless 路由代理。
- 推送与部署过程符合分支与环境规范：dev 分支开发、合并到 main 前需测试与您的确认。

## 前置检查
1. GitHub 仓库：
- 前端：`michael4wk/Tarot`（已推送，含 LFS）
- 后端：本地目录在 `/Users/michael/Documents/Code/Trae/Tarot-backend`，将初始化为私有仓库并推送
2. 开发环境：
- Node 18+ / npm
- Vercel CLI（将使用 npm 安装）
- Homebrew 已用于系统工具（已遵循）
3. 网络：默认不需 VPN；如 Zhipu 访问不稳，将提示您临时开启 VPN 再执行。

## 前端项目（Vercel）
1. 创建/链接 Vercel 项目：`tarot`
- 方式：使用 Vercel CLI（Solo Builder）在本地目录 `/Users/michael/Documents/Code/Trae/Tarot2` 链接到 GitHub 仓库
- 构建：Vite（默认 `npm run build`）
- 产物：`dist/`（仓库忽略，无需推送）
2. 前端环境变量（非敏感，客户端可见）：
- `VITE_AI_DEV_PROXY=0`
- `VITE_AI_BASE_URL=https://<后端项目域名>`（创建后替换）
- Hedge 相关（按现有 `.env.local` 配置迁移为生产）：
  - `VITE_AI_HEDGE_ENABLED=1`
  - `VITE_AI_HEDGE_DELAY_MS=0`
  - `VITE_AI_ABORT_LOSER=1`
  - `VITE_AI_TIMEOUT_MS=15000`
  - 可选：`VITE_AI_HEDGE_LOG_LEVEL=warn`
3. 生产安全：不设置任何 `VITE_GEMINI_API_KEY`/`VITE_ZHIPU_API_KEY` 到前端。

## 后端项目（私有仓库 + Vercel）
1. 代码结构（最小实现）：
- `api/ai/gemini/generate.ts`：代理转发到 Gemini，处理超时/重试/CORS
- `api/ai/zhipu/generate.ts`：代理转发到 Zhipu，同样的门控与 CORS
- `utils/cors.ts`：读取 `ALLOWED_ORIGINS`，统一设置 CORS
- `utils/http.ts`：统一 fetch/超时/重试封装，避免重复逻辑
- `vercel.json`：若需自定义路由/函数超时（默认 10s，可按 `AI_PROXY_TIMEOUT_MS` 调整）
2. 后端环境变量（只在 Vercel 后端项目设置）：
- `GEMINI_API_KEY`（来自您本地 `.env.local`）
- `ZHIPU_API_KEY`（来自您本地 `.env.local`，如启用）
- `AI_PROXY_TIMEOUT_MS=15000`
- `ALLOWED_ORIGINS=https://<前端域名>`（例如 `https://tarot.vercel.app`）
- 可选：`GEMINI_MODEL`、`ZHIPU_MODEL`（如需后端控制）
3. 分支与推送：
- 初始化私有仓库；创建 `dev` 分支开发
- 推送到 GitHub 后，创建 Vercel 项目（`tarot-backend`）并关联

## 验证流程
1. 后端联调：
- 通过 `curl`/`HTTPie` 调用 `POST /api/ai/gemini/generate` 与 `/api/ai/zhipu/generate`，验证 200 响应与 CORS 头
- 在无 VPN 环境下检查 Gemini/Zhipu 的竞速表现（Zhipu通常更快），根据 `AI_PROXY_TIMEOUT_MS` 与各自 provider 超时/重试参数验证行为
2. 前端联调：
- 设置前端 `VITE_AI_BASE_URL` 指向后端生产域名
- 打开前端生产地址，触发解读流程，观察 Hedge 日志门控（仅 warn/info 输出）
3. 回归用例：
- 离线/弱网模拟（临时关闭网络），验证降级与总超时回退机制稳定

## 运维与监控（Hobby）
- 使用 Vercel Dashboard 观察函数调用/错误日志
- 若需要，添加 `Sentry`（后续再议，当前不超范围）
- 图片资源已用 Git LFS，后续推送更稳定；不影响前端构建

## 交付节奏
1. 我将先实现并推送后端私有仓库（dev 分支），创建 Vercel 后端项目并配置环境变量
2. 设置前端项目环境变量，触发构建部署
3. 完成端到端验证，输出部署验收报告
4. 等您确认后，合并 dev -> main

## 可能风险与处理
- Zhipu 访问不稳：提示开启 VPN 后重试；或先仅启用 Gemini
- 函数超时：根据实际表现调整 `AI_PROXY_TIMEOUT_MS` 与各 provider 超时/重试
- CORS：若跨域失败，校对 `ALLOWED_ORIGINS` 与前端域名完全匹配

请确认以上计划，我将开始实施（不会越过产品/技术文档范围，所有变更走 dev 分支并在实施过程中保留详细注释）。