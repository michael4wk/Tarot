## 现状回顾
- 前端：Vercel 预览已稳定，卡背与抽牌流程正常。
- 后端：已在 Vercel 创建 `tarot-backend` 并连接私有仓库，环境变量已配置。
- 双仓结构：前端（Tarot2）+ 后端（Tarot-backend）。

## 目标
- 让前端在预览环境通过后端安全调用 AI，避免浏览器暴露密钥。
- 完成联调与验证，确认功能打通。

## 后端接口规范
- 路径与方法：
  - `POST /api/ai/gemini/generate` → 代理 Google Generative Language API（generateContent）
  - `POST /api/ai/zhipu` → 代理 Zhipu Chat Completions API
- 请求体：直接透传前端构造的 JSON（tarotService.ts:1120-1127、1277-1289）。
- 响应：完整透传上游 JSON 文本；状态码同上游。
- 安全：密钥仅在后端 `process.env` 中读取（如 `GEMINI_API_KEY`、`ZHIPU_API_KEY`），不在响应/日志中泄露。
- CORS：允许来自前端预览域名（Vercel 的 `*.vercel.app` 预览域），限制来源与方法为 `POST`，`Content-Type: application/json`。

## 前端环境变量（Preview 作用域）
- 必需：
  - `VITE_ENABLE_AI_READING=true`
  - `VITE_AI_DEV_PROXY=0`（禁用本地 dev 代理路径）
  - `VITE_AI_BASE_URL=https://<你的-backend-vercel-domain>`（无需斜杠结尾）
- 可选：
  - `VITE_GEMINI_MODEL`（默认 `gemini-2.0-flash`）
  - `VITE_ZHIPU_MODEL`（默认 `glm-4`）
  - `VITE_AI_TIMEOUT_MS`（总超时，默认 15000ms，tarotService.ts:828-835）
  - `VITE_GEMINI_RETRIES`、`VITE_ZHIPU_RETRIES`（默认 1，指数退避，tarotService.ts:1129、1304）

## 联调步骤
1. 后端自测
   - `curl -X POST https://<backend>/api/ai/gemini/generate -H 'Content-Type: application/json' -d '{"contents":[{"role":"user","parts":[{"text":"{\"core\":\"test\",\"actions\":[\"a\"],\"warnings\":[\"w\"]}"}]}]}'` 确认 200/JSON 返回。
   - 同样验证 `/api/ai/zhipu`。
2. 配置前端 Preview 环境变量并 Redeploy。
3. 在预览页进行：输入问题→抽牌→选中→点击“开始解读”。
4. Network 面板验证：
   - 请求走 `VITE_AI_BASE_URL` 的 `/api/ai/gemini/generate` 或 `/api/ai/zhipu`；
   - 状态码 200；响应包含 `core/actions/warnings`。
5. 失败处理：
   - 4xx/无权：检查后端密钥与模型名；
   - 5xx/超时：查看后端日志与上游返回体片段；前端将回退 Mock（tarotService.ts:1002-1011）。

## 安全与合规
- 密钥仅后端保存；前端不配置 `VITE_*_API_KEY`（避免泄露）。
- CORS 限制来源为前端预览域；生产上线时增加主域。
- 日志脱敏：记录状态码与片段，不输出完整敏感体。

## 合并到 main 的条件
- 前端预览下成功完成一次 AI 解读（结构化返回），且抽牌/卡背流程稳定。
- 后端日志无报错并具备降级与重试策略（tarotService.ts:233-274、582-623）。

## 后续可选优化
- 加入速率限制与鉴权（API Token）以防滥用。
- 为后端接口增加健康检查与监控（错误率、超时统计）。
- 前端增加用户级防抖与失败提示优化（保持现有 Mock 兜底）。