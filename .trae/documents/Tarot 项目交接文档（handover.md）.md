# Tarot 项目交接文档（双仓、密钥安全、发布联调）

## 项目全貌
- 双仓结构：
  - 前端（Tarot2，Vite+Vue3，部署到 `tarotpro.vercel.app`）
  - 后端（Tarot-backend，Vercel Functions/Edge，部署到 `tarotpro-backend.vercel.app`）
- 目标：
  - 前端并发竞速（Hedge）、总超时回退 Mock，用户体验不崩溃
  - API 密钥仅在后端读取与使用，浏览器不暴露密钥
  - 生产与预览环境均可联调，域名缓存一致

## 仓库与分支策略
- 分支：`main`（生产）、`dev`（预览）
- 工作流：
  - 开发与联调在 `dev`，经验证后 PR 合并到 `main`
  - Vercel 前端：Production 跟踪 `main`，Preview 跟踪 `dev`
  - Vercel 后端：同上

## 前端架构与关键代码
- 并发竞速与回退：
  - 总开关与回退：`src/services/tarotService.ts:813、828–835`
  - Gemini 调用分支选择：`src/services/tarotService.ts:1088–1103、1134–1183`
  - Zhipu 调用分支选择：`src/services/tarotService.ts:1233–1253、1293–1346`
- 重要修复（允许后端域调用）
  - Gemini：`src/services/tarotService.ts:1098–1103` 改为允许 `(!proxyOn && !apiKey && !baseUrl)` 才阻断
  - Zhipu：`src/services/tarotService.ts:1251–1253` 改为允许 `(!proxyOn && !apiKey && !baseUrl)` 才阻断
  - 目的：前端无密钥但配置了后端域时，走后端稳定域 `VITE_AI_BASE_URL` 发起 `POST`

## 后端架构与端点规范
- 域名：`https://tarotpro-backend.vercel.app`（Connect to Production）
- 路由：
  - `POST /api/ai/gemini/generate`
    - 上游：`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`
    - Headers：`x-goog-api-key: ${GEMINI_API_KEY}`、`Content-Type: application/json`、`Accept: application/json`
    - Body：仅 `{"contents":[{"role":"user","parts":[{"text":"..."}]}]}`（不要在 body 顶层传 `model`）
    - 超时：`AI_PROXY_TIMEOUT_MS=15000`
  - `POST /api/ai/zhipu`
    - 上游：`https://open.bigmodel.cn/api/paas/v4/chat/completions`
    - Headers：`Authorization: Bearer ${ZHIPU_API_KEY}`、`Content-Type`、`Accept`
    - Body：`{"model":"glm-4-flash","messages":[{"role":"user","content":"..."}]}`（含温度、top_p、max_tokens 等）
    - 超时：`AI_PROXY_TIMEOUT_MS=15000`
- 预检与 CORS：
  - `OPTIONS` → 204；`Access-Control-Allow-Methods: POST, OPTIONS`；`Access-Control-Allow-Headers: Content-Type`；`Access-Control-Max-Age: 600`；`Vary: Origin`
  - 白名单：至少包含 `https://tarotpro.vercel.app`；暂时联调 Preview 才加预览域，结束后移除
- 日志与安全：脱敏；记录状态码与少量片段（≤500 字），不输出密钥与完整体；健康检查 `GET /api/ping`

## 环境变量清单
- 前端（Production 作用域）
  - 必须：
    - `VITE_ENABLE_AI_READING=true`
    - `VITE_AI_DEV_PROXY=0`
    - `VITE_AI_BASE_URL=https://tarotpro-backend.vercel.app`
    - `VITE_DISABLE_ZHIPU=0`
    - `VITE_DEBUG_AI=1`
  - 建议：
    - `VITE_AI_HEDGE_ENABLED=1`、`VITE_AI_HEDGE_DELAY_MS=0`、`VITE_AI_ABORT_LOSER=1`
    - `VITE_AI_TIMEOUT_MS=15000`
    - `VITE_GEMINI_RETRIES=1`、`VITE_ZHIPU_RETRIES=1`
- 后端（Production 与 Preview 作用域）
  - `GEMINI_API_KEY`、`ZHIPU_API_KEY`
  - `GEMINI_MODEL=gemini-2.0-flash`、`ZHIPU_MODEL=glm-4-flash`
  - `AI_PROXY_TIMEOUT_MS=15000`
  - `ALLOWED_ORIGINS=https://tarotpro.vercel.app`（必要时临时加预览域）

## 安全策略
- 密钥仅后端持有，浏览器不暴露；前端所有调用经后端域（代理）完成
- CORS + 预检严格控制跨域；日志脱敏，保留少量片段用于问题定位

## 部署与域名绑定（发布后标准动作）
- 合并到 `main` → 前端/后端自动触发 Production 构建
- 若出现少量节点静态资源不一致（Safari 偶发不显示）：
  - 前端 Deployment 执行一次 “Redeploy”
  - Settings → Domains 对 `tarotpro.vercel.app` 点击 “Refresh”（Purge Cache）
  - 等 1–2 分钟，无痕 + `?nocache=1` 验证；直连几张卡牌 PNG 资源确认 200 且大小正常

## 联调步骤（端到端验收）
1. 在 `https://tarotpro.vercel.app`：输入问题 → 抽牌 → 选牌 → “开始解读”
2. Network 预期出现：
   - `POST https://tarotpro-backend.vercel.app/api/ai/gemini/generate` 或
   - `POST https://tarotpro-backend.vercel.app/api/ai/zhipu`
3. 页面展示结构化 `core/actions/warnings`；若供应商超时或网络受限，约 15s 后回退到 Mock

## 故障排查与最少操作
- 无请求：检查前端 Production 环境变量（尤其 `VITE_ENABLE_AI_READING`、`VITE_AI_DEV_PROXY=0`、`VITE_AI_BASE_URL`、`VITE_DISABLE_ZHIPU=0`），Redeploy；必要时临时把 `VITE_AI_DEV_PROXY=1` 验证代理分支（仅定位）
- 4xx/5xx：后端核对 URL/headers/body；Gemini v1beta + `x-goog-api-key`；不在 body 顶层传 `model`
- 静态资源异常：执行 “Redeploy” + Domains “Refresh”，无痕强刷
- 直连受限（GFW/网络）：建议开启 VPN 测试；保持 Zhipu 备选增强可用性

## 发布与回滚
- 发布：`dev` 联调通过 → PR 合并 `dev → main` → 自动 Production 部署 → 标准化刷新（如需）
- 回滚：Production 出现异常 → 在 Vercel 选择上一条稳定部署 “Instant Rollback” → 再按标准化刷新

## 分工与协作
- 前端（体验与协调）：
  - 并发竞速策略与总超时回退；启用判断与后端域分支逻辑（tarotService.ts 行号如上）
  - 发布后静态资源一致性排障（Redeploy + Refresh + 无痕验证）
- 后端（接口与安全）：
  - 两路代理端点实现与维护；密钥与 CORS 管理；日志脱敏；健康检查
  - 域名绑定（Connect to Production）与必要的 Promote/Redeploy/Refresh

## 交付物列表
- 本交接文档（handover.md）
- 前端 Production 环境变量清单与值
- 后端 Production/Preview 环境变量清单与值（仅名称与说明，不含密钥）
- 验收记录：Network 请求截图与成功返回片段（不含敏感信息）

## 附：请求示例（供后端联调自测）
- Gemini：
  - URL: `https://tarotpro-backend.vercel.app/api/ai/gemini/generate`
  - Headers: `Content-Type: application/json`
  - Body: `{"contents":[{"role":"user","parts":[{"text":"{\"core\":\"连通性自检\"}"}]}]}`
- Zhipu：
  - URL: `https://tarotpro-backend.vercel.app/api/ai/zhipu`
  - Headers: `Content-Type: application/json`
  - Body: `{"model":"glm-4-flash","messages":[{"role":"user","content":"{\"core\":\"连通性自检\"}"}]}`

---
- 备注：Safari 间歇不显示卡牌 PNG 属缓存/边缘传播差异；按“Redeploy + Domains Refresh + 无痕验证”的标准动作即可恢复全网一致。
