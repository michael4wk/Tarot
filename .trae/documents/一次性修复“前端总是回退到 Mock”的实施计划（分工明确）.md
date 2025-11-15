## 问题根因
- 前端在调用前的开关判断把请求短路了：当 `proxyOn=false` 且浏览器没有 `VITE_GEMINI_API_KEY` 时，直接抛错并回退 Mock，即使已经配置了后端域 `VITE_AI_BASE_URL` 也不会走。
- 具体位置：
  - Gemini：`src/services/tarotService.ts:1098–1103`
  - Zhipu：同文件 1233–1253 附近逻辑

## 修复目标
- 允许“前端无密钥 + 配置了后端域”时走后端代理域发起请求；保持并发竞速与回退逻辑不变。

## 实施步骤与分工

### Step 1｜前端代码修复（我负责）
- 修改 Gemini 的启用判断：
  - 现有：`if (!enabled || (!proxyOn && !apiKey)) { throw new Error('AI 未启用或缺少密钥') }`
  - 改为：`if (!enabled || (!proxyOn && !apiKey && !baseUrl)) { throw new Error('AI 未启用或缺少密钥或后端域') }`
  - 这样当 `proxyOn=false` 且 `baseUrl` 非空时，走 `else if (baseUrl) { ... }` 分支，发起 `POST ${baseUrl}/api/ai/gemini/generate`。
- 同步修改 Zhipu 的启用判断（位置在 1236 一带）：
  - 现有：禁用或无密钥时阻断
  - 改为：允许“无密钥 + 有 `baseUrl`”继续走后端域分支（与 Gemini 同策略）。
- 不改动并发与回退实现，其余逻辑照旧。

### Step 2｜前端环境配置（你负责）
- 作用域：Production（前端项目 Tarot2）
- 必须：
  - `VITE_ENABLE_AI_READING=true`
  - `VITE_AI_DEV_PROXY=0`（关闭相对路径代理，让代码走 `VITE_AI_BASE_URL`）
  - `VITE_AI_BASE_URL=https://tarotpro-backend.vercel.app`
  - `VITE_DISABLE_ZHIPU=0`（显式允许 Zhipu）
  - `VITE_DEBUG_AI=1`
- 建议：
  - `VITE_AI_HEDGE_ENABLED=1`、`VITE_AI_HEDGE_DELAY_MS=0`、`VITE_AI_ABORT_LOSER=1`
  - `VITE_AI_TIMEOUT_MS=15000`
  - `VITE_GEMINI_RETRIES=1`、`VITE_ZHIPU_RETRIES=1`
- 完成后点击前端 “Redeploy”，并在无痕模式访问 `https://tarotpro.vercel.app/?nocache=1` 强刷。

### Step 3｜后端复核（后端 IDE，已基本完成）
- 继续保持：
  - Gemini：`v1beta/models/gemini-2.0-flash:generateContent`，`x-goog-api-key` 头，body 仅 `contents/parts/text`
  - Zhipu：`/api/ai/zhipu`（Bearer 密钥，`model/messages` 体）
  - CORS：动态白名单仅放行 `POST` 与 `Content-Type`，统一 `OPTIONS 204` 预检
- 域名：`tarotpro-backend.vercel.app` 为 “Connect to Production”。若主域绑定或缓存异常，执行 `Promote → Redeploy → Refresh`。

### Step 4｜联调与验收（我主导，你配合看结果）
- 在 `https://tarotpro.vercel.app`：输入问题→抽牌→选牌→“开始解读”。
- 预期 Network 出现：
  - `POST https://tarotpro-backend.vercel.app/api/ai/gemini/generate` 或
  - `POST https://tarotpro-backend.vercel.app/api/ai/zhipu`
- 页面展示结构化 `core/actions/warnings`；若供应商超时或网络受限（未开 VPN），约 15s 总超时后回退 Mock。

### Step 5｜回归与优化（共同）
- 若仍无请求：
  - 我根据 `VITE_DEBUG_AI` 控制台日志判断具体未命中的条件，做最小代码修正或给出临时把 `VITE_AI_DEV_PROXY=1` 的验证方案（仅用于定位分支逻辑）。
- 若有请求但 4xx/5xx：
  - 后端复核模型字符串与 headers（Gemini 2.0 flash；`x-goog-api-key`；不在 body 顶层传 model），Zhipu 保持 200。

## 顺序与责任
1) 我先改前端代码的启用判断（Gemini & Zhipu）。
2) 你更新前端 Production 环境变量并 Redeploy（方案 A）。
3) 后端仅做域绑定与 CORS复核（已完成为主）。
4) 我在主域做端到端验证，输出结果与下一步最少操作；通过则结束。

## 交付标准
- 主域 Network 出现后端代理的 `POST /api/ai/...`。
- 页面展示结构化解读；超时或异常时回退 Mock，无崩溃。

若你确认，我立刻执行 Step 1 的前端代码修复，然后指导你完成 Step 2 的环境更新与 Redeploy，并继续完成联调验收。