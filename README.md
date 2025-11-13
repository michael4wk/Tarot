# Tarot2 前端（Vercel 项目：tarot）

> 项目简介：极简塔罗牌应用前端，采用“双仓 + Vercel(hobby)”部署策略，生产环境由后端承接 AI 调用，前端不注入任何敏感密钥。

## 快速启动（开发模式）

- 本地开发（启用 AI 开发代理）：
  - 命令：`npm run dev:ai`
  - 行为：启用 `VITE_AI_DEV_PROXY=1`，前端通过本地代理路由调用 AI，避免在浏览器中暴露密钥

## 部署架构（最佳实践）

- 前端仓库（公开）：本仓库，连接到 Vercel 项目名 `tarot`
- 后端仓库（私有）：推荐 `tarot-backend`，连接到独立的 Vercel 后端项目
- 生产安全：
  - 前端不注入任何敏感密钥（例如 `GEMINI_API_KEY`）
  - 所有 AI 请求经由后端安全路由（例如：`POST /api/ai/gemini/generate`）
  - 后端启用 CORS 白名单，仅允许来自前端正式域名的请求

## 环境变量规范

- 前端（Web）：仅非敏感变量
  - `VITE_AI_DEV_PROXY`：开发代理开关（开发：1；生产：0）
  - `VITE_AI_BASE_URL`：后端基座地址（生产必填，例如 `https://tarot-backend.vercel.app`）
- 后端（Serverless）：敏感密钥与运行参数（在 Vercel 后端项目配置）
  - `GEMINI_API_KEY`（敏感，仅后端）
  - `AI_PROXY_TIMEOUT_MS`、`GEMINI_MODEL`、`ALLOWED_ORIGINS` 等

## AI 解释与 Hedge 日志门控

- Hedge 并发竞速（Gemini / Zhipu）：通过环境变量配置行为，阈值控制日志输出与事件发布
  - `VITE_AI_HEDGE_ENABLED`：是否启用竞速（默认启用）
  - `VITE_AI_HEDGE_DELAY_MS`：第二路起跑延迟（毫秒，默认 120）
  - `VITE_AI_ABORT_LOSER`：胜者确定后是否中止败者（默认 true）
  - `VITE_AI_HEDGE_LOG_LEVEL`：日志阈值（`debug` | `info` | `warn` | `error`，默认 `warn`）
- 开发期诊断与降噪：
  - `readHedgeConfig` 在 `DEV=true` 时仅在 `logLevel=debug` 输出诊断（`console.debug`），避免干扰测试计数。
  - 远程卡组拉取失败：当阈值为 `info` 时降级为 `console.info`（其余阈值仍为 `console.warn`），保持错误可见同时避免非关键路径噪音。
## 生产部署步骤（Vercel Hobby）

1. 前端：将公开 GitHub 仓库连接至 Vercel，创建项目名 `tarot`
2. 后端：将私有 GitHub 仓库连接至 Vercel，创建后端项目（推荐名 `tarot-backend`）
3. 后端环境变量：在 Vercel 后端项目设置 `GEMINI_API_KEY` 等敏感变量，并配置 `ALLOWED_ORIGINS`
4. 前端环境变量：在 Vercel 前端项目设置：
   - `VITE_AI_DEV_PROXY=0`
   - `VITE_AI_BASE_URL=https://tarot-backend.vercel.app`
5. 触发构建并访问 `https://tarot.vercel.app`

## 并发竞速说明（Hedge）

- 开关：`VITE_AI_HEDGE_ENABLED=true`
- 延迟：`VITE_AI_HEDGE_DELAY_MS=0`（两路同时起跑，或设 120-250ms 稍后起跑）
- 败者中止：`VITE_AI_ABORT_LOSER=1`
- 总超时：`VITE_AI_TIMEOUT_MS` 达到后回退 Mock，体验稳定

## 敏感信息安全

- `.gitignore` 已包含 `.env*`（保留 `.env.example`），确保 `/.env.local` 不被推送
- 生产密钥仅配置在后端项目的环境变量，不进入前端构建产物
