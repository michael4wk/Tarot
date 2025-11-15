**总体目标**
- 保持双仓结构与密钥安全：前端不持有任何 API 密钥，所有 AI 请求经后端代理。
- 维持并发竞速体验：前端 Hedge 配置与总超时不变，弱网下可自动回退，用户始终有可读结果。
- 在 Preview 与 Production 两个环境完成端到端联调与稳定运行。

**环境现状确认**
- 前端 Production 已设置：
  - `VITE_ENABLE_AI_READING=true`
  - `VITE_AI_DEV_PROXY=0`
  - `VITE_AI_BASE_URL=https://tarotpro-backend.vercel.app`
  - `VITE_AI_HEDGE_ENABLED=1`、`VITE_AI_HEDGE_DELAY_MS=0`、`VITE_AI_ABORT_LOSER=1`、`VITE_AI_HEDGE_LOG_LEVEL=warn`
  - `VITE_AI_TIMEOUT_MS=15000`
- 后端 Production 已设置：
  - `GEMINI_API_KEY`、`ZHIPU_API_KEY`
  - `GEMINI_MODEL=gemini-2.0-flash`、`ZHIPU_MODEL=glm-4-flash`
  - `AI_PROXY_TIMEOUT_MS=15000`
  - `ALLOWED_ORIGINS=https://tarotpro.vercel.app`（建议后续加上你当前使用的 Preview 域，便于预览联调）

**分步执行计划（执行前确认）**
- 阶段 A：后端只读连通性检查
  - 我将用只读方式对 `https://tarotpro-backend.vercel.app/api/ai/gemini/generate` 和 `/api/ai/zhipu` 进行 POST 验证，体与前端一致（JSON-only 的 prompt 封装）。
  - 记录状态码与关键片段，确保路由可达、密钥与模型有效、CORS 放行。
- 阶段 B：前端 Preview 联调
  - 你仅需打开 Preview 链接，按“输入问题 → 抽牌 → 选牌 → 开始解读”。
  - 我在后台采集 Network 请求是否走后端域名与响应是否结构化（`core/actions/warnings`），如失败回退则收集错误并给出修正。
- 阶段 C：前端 Production 联调
  - 在 `https://tarotpro.vercel.app` 执行与 Preview 同样的动作。
  - 若出现静态资源或绑定差异，我将指导你仅点击 “Promote → Redeploy → Refresh” 并在无痕窗口强刷，避免复杂操作。
- 阶段 D：体验与参数微调（如需）
  - 根据你的网络情况微调重试次数：`VITE_GEMINI_RETRIES=1`、`VITE_ZHIPU_RETRIES=1`，平衡速度与稳定性。
  - 维持总超时 15s 与 Hedge 并发（延迟 0ms），确保 10–12 秒内有结果。

**验证标准**
- 成功：
  - 前端 Network 出现 `POST https://tarotpro-backend.vercel.app/api/ai/gemini/generate` 或 `/api/ai/zhipu`
  - 返回体可解析为含 `core`（约 300–350 字）、`actions`（2–3 条）、`warnings`（≤3）的 JSON。
- 失败但可接受：
  - 总超时约 15s 后自动回退到 Mock，页面有模板文案。
  - 我会定位失败原因（密钥、模型、CORS 或上游 5xx），并给出一键修复步骤。

**后续运维与安全**
- 后端日志脱敏：仅记录状态码与错误片段 ≤500 字符，绝不输出密钥。
- CORS 白名单建议包含生产与预览两个前端域名，避免预览联调时被拒。
- 如需进一步安全控制，可为后端接口加简单鉴权（例如 `X-API-Token`），前端通过环境变量注入非敏感令牌。

**你需要做的最少动作**
- 告知我你当前使用的前端 Preview 域名（完整 URL），以便我将其加入后端 CORS 白名单的建议值里。
- 当我回报“需要点击某按钮”时，仅在 Vercel 控台完成该按钮操作（Promote、Redeploy、Refresh），并在浏览器里用无痕 + `?nocache=1` 验证结果。

若你确认上面的计划，我将开始执行阶段 A 的后端只读连通性检查，并把结果与下一步的操作发给你。

**直接结论**
- 只用 `tarotpro.vercel.app` 做生产联调完全可以，不需要把前端的 Preview 域加到后端白名单。
- 只有当你“在浏览器里打开前端的 Preview 链接，并且要走后端代理”时，才需要把该 Preview 域名加入后端的 `ALLOWED_ORIGINS`。否则，Preview 调用后端会被 CORS 拒绝。

**推荐做法**
- 生产联调与日常用户访问：
  - 保持后端白名单仅包含 `https://tarotpro.vercel.app`（安全、收敛）。
  - 前端 Production 环境变量指向后端域名，继续用 `tarotpro.vercel.app` 验证即可。
- 需要在 Preview 下联调时：
  - 将当前使用的前端 Preview 域名一并加入后端 `ALLOWED_ORIGINS`（逗号分隔）。
  - 预览完成后，可移除该 Preview 域，保持生产白名单最小化。

**后续执行计划（详尽版）**
- 阶段 A｜后端只读连通性检查
  - 对 `POST https://tarotpro-backend.vercel.app/api/ai/gemini/generate` 和 `POST https://tarotpro-backend.vercel.app/api/ai/zhipu` 发起只读测试，记录状态码与片段，确认：
    - 路由连通
    - 模型与密钥有效
    - CORS 对生产前端域放行
- 阶段 B｜前端 Production 联调
  - 在 `https://tarotpro.vercel.app` 执行“输入问题 → 抽牌 → 选牌 → 开始解读”
  - 验证 Network 出现 `POST https://tarotpro-backend.vercel.app/api/ai/...`，响应体含结构化 `core/actions/warnings`
  - 如失败，收敛到三步操作：当前部署 “Promote → Redeploy”，Domains 对自定义域 “Refresh”，后无痕强刷
- 阶段 C｜并发竞速与参数微调（如需）
  - 保持 `VITE_AI_HEDGE_ENABLED=1`、`VITE_AI_HEDGE_DELAY_MS=0`、`VITE_AI_ABORT_LOSER=1`、`VITE_AI_HEDGE_LOG_LEVEL=warn`
  - 总超时：`VITE_AI_TIMEOUT_MS=15000`
  - 重试建议：`VITE_GEMINI_RETRIES=1`、`VITE_ZHIPU_RETRIES=1`（在弱网场景更稳妥）
- 阶段 D｜运维与安全
  - 后端 Runtime Logs 保持脱敏：仅状态码与部分错误片段（≤500 字）
  - 后端白名单仅保留生产域；如需临时预览联调，再显式加 Preview 域，完成后移除
  - 可选加 `X-API-Token` 轻鉴权，前端以非敏感变量传递令牌

你确认后，我就按这个计划先执行“后端只读连通性检查”和“前端 Production 端到端验证”，并把检测结果与需要你点击的最少步骤反馈给你。

## 执行内容（只读）

* 后端：对 `https://tarotpro-backend.vercel.app` 的两个端点执行 POST 测试，记录状态与响应片段：

  * `POST /api/ai/gemini/generate`，体为前端使用的 JSON-only prompt 封装

  * `POST /api/ai/zhipu`，体为 Chat Completions 格式，内容同上

* 前端（生产）：检验关键静态资源是否一致并可达：

  * `GET https://tarotpro.vercel.app/index.html`

  * `GET https://tarotpro.vercel.app/assets/card_back-*.svg`

  * `GET https://tarotpro.vercel.app/assets/major_arcana_tower-*.png`

* 汇总结果与一键修复建议（仅需你在 Vercel 页面点击 Promote / Redeploy / Refresh，上线后再用无痕强刷验证）。

## 输出

* 后端两个端点的状态与响应片段（指示是否密钥/模型/CORS有效）

* 前端静态资源一致性与可达性结论

* 若存在异常，给出最少操作步骤（Promote → Redeploy → Refresh）及再次验证方式
# 项目交接文档（Tarot 前后端生产迁移与联调）

## 项目概览
- 双仓结构：
  - 前端（Tarot2，Vite + Vue 3）负责 UI、抽牌流程、并发竞速调用后端代理。
  - 后端（Tarot-backend，Vercel Functions/Edge Functions）负责代理 AI 提供商，持有密钥并做 CORS 安全控制。
- 安全原则：密钥仅在后端保存；前端不配置任何 `VITE_*_API_KEY`；所有 AI 请求通过后端域 `https://tarotpro-backend.vercel.app`。

## 前端现状（Production）
- 主域：`https://tarotpro.vercel.app` 已连接到 Production，静态资源与卡背/卡牌 PNG 均可达（200）；默认域与主域一致。
- 环境变量（Production 作用域）：
  - `VITE_ENABLE_AI_READING=true`
  - `VITE_AI_DEV_PROXY=0`
  - `VITE_AI_BASE_URL=https://tarotpro-backend.vercel.app`
  - 并发竞速：`VITE_AI_HEDGE_ENABLED=1`、`VITE_AI_HEDGE_DELAY_MS=0`、`VITE_AI_ABORT_LOSER=1`、`VITE_AI_HEDGE_LOG_LEVEL=warn`
  - 总超时：`VITE_AI_TIMEOUT_MS=15000`
- 端到端期望：页面点击“开始解读”时，Network 出现 `POST https://tarotpro-backend.vercel.app/api/ai/<provider>`，响应体含 `core`、`actions`（2–3）、`warnings`（≤3）。

## 后端现状（Production）
- 已配置的环境变量：
  - `GEMINI_API_KEY`、`ZHIPU_API_KEY`
  - `GEMINI_MODEL=gemini-2.0-flash`、`ZHIPU_MODEL=glm-4-flash`
  - `AI_PROXY_TIMEOUT_MS=15000`
  - `ALLOWED_ORIGINS=https://tarotpro.vercel.app`
- 连通性实测：
  - `POST /api/ai/gemini/generate`：返回 400 INVALID_ARGUMENT（提示 model 格式错误）
  - `POST /api/ai/zhipu`：返回 404（路由不存在）

## 后端改造任务（最小实现）
1) Gemini 端点修复（`POST /api/ai/gemini/generate`）：
   - 上游 URL 必须为：`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`。
   - 透传前端 JSON body：`{"contents":[{"role":"user","parts":[{"text":"<JSON-only>"}]}]}`；不要在 body 顶层传 `model`。
   - Header：`Content-Type: application/json`、`Accept: application/json`。
   - 超时：读取 `AI_PROXY_TIMEOUT_MS`（默认 15000ms）；超时时返回 504 JSON `{ error: 'upstream timeout', provider: 'gemini' }`。
   - 错误体处理：保留上游状态码与体；最多记录 500 字片段用于日志诊断，避免泄漏敏感内容。

2) Zhipu 端点新增（`POST /api/ai/zhipu`）：
   - 上游 URL：`https://open.bigmodel.cn/api/paas/v4/chat/completions`。
   - Header：`Authorization: Bearer ${ZHIPU_API_KEY}`、`Content-Type: application/json`、`Accept: application/json`。
   - body：`{ model: ZHIPU_MODEL || 'glm-4-flash', messages: [{ role: 'user', content: '<JSON-only>' }] }`。
   - 超时与错误返回同上。

3) CORS 安全控制：
   - 读取 `ALLOWED_ORIGINS`（逗号分隔），动态比对请求 `Origin`，命中时设置 `Access-Control-Allow-Origin` 为该值。
   - 仅放行 `POST` 与 `Content-Type: application/json`；其余方法与头拒绝或返回 405。

## 部署与联调流程
1) 后端：完成上述两个端点与 CORS 后，在 Vercel 后端项目点击一次 `Redeploy`。
2) 前端：保持 Production 环境变量不变；打开 `https://tarotpro.vercel.app` 进行端到端验证：
   - 输入问题 → 抽牌 → 选牌 → 点击“开始解读”。
   - Network 应出现 `POST https://tarotpro-backend.vercel.app/api/ai/gemini/generate` 或 `/api/ai/zhipu`；响应为结构化 JSON。
3) 若出现资源或绑定异常：对当前生产部署执行 `Promote → Redeploy`，Domains 对自定义域点击 `Refresh`，随后在无痕窗口强刷（`?nocache=1`）。

## 回滚与兜底策略
- Gemini 仍 400：检查是否使用 `v1beta` 路径且未在 body 顶层传 `model`；必要时实现 v1/v1beta 双尝试（先 v1beta，再 v1）。
- Zhipu 仍 404：核对路由文件路径与命名是否匹配 Vercel Functions 的路由规则（确保落到 `/api/ai/zhipu`）。
- 总超时或上游 5xx：前端在约 15s 总超时后回退到本地 Mock 文案，保证用户体验不崩溃。

## 验证清单与判定标准
- 成功：
  - 生产域 `tarotpro.vercel.app` 下，Network 出现后端代理的 `POST` 请求；返回体含 `core`（300–350 字内）、`actions`（2–3）、`warnings`（≤3）。
- 失败但可接受：
  - 总超时后，页面显示模板文案；你只需记录状态码与错误片段（例如 400/404/504），据此按“回滚与兜底策略”修复。

## 交接说明（给后端 IDE 使用）
- 按“后端改造任务”完成两个路由与 CORS 设置并 Redeploy。
- 完成后告知前端协作位（或由当前会话自动发起只读连通性与端到端验证）。
- 所有生产联调都在主域完成；仅当需要在 Preview 页面联调时，才把当前 Preview 域加到后端 `ALLOWED_ORIGINS`，联调结束后可移除，保持白名单最小化。

## 角色分工与协作流程

### 角色职责
- 我（前端与总体协调）负责：
  - 设计与维护前端体验与并发竞速策略（Hedge/总超时/重试）；确保用户体验不崩溃（失败回退 Mock）。
  - 只读连通性与端到端验证：自动对后端端点发起只读测试；在主域执行抽牌→解读验证；输出最少操作提示（Promote→Redeploy→Refresh）。
  - 生产域静态资源与域绑定排障：当自定义域缓存/绑定异常时给出一键式指引与验证链路。

- 后端 IDE 负责：
  - 实现并维护两路代理端点（Gemini/Zhipu），严格遵循上游 URL/版本与 body/header 规范；持有密钥，禁止泄露。
  - CORS 安全控制与日志脱敏；按 `ALLOWED_ORIGINS` 动态放行；输出状态码与最多 500 字错误片段。
  - 部署与运行维护（Redeploy/监控/限流可选）；遇到 4xx/5xx/504 等上游或网络问题时定位与修复。

### 协作流程（先后顺序与触发点）
1) Phase 0｜设计与准备（我）
   - 明确前端参数：`VITE_ENABLE_AI_READING=true`、`VITE_AI_DEV_PROXY=0`、`VITE_AI_BASE_URL=<后端域>`、Hedge/超时/重试策略。
   - 输出路由与规范（已在本文件“后端改造任务”部分给出）。

2) Phase 1｜后端实现与 Redeploy（后端 IDE）
   - 完成 `POST /api/ai/gemini/generate` 与 `POST /api/ai/zhipu`；设置 CORS；点击一次 `Redeploy`。
   - 触发条件：后端代码提交或环境变量调整完成。

3) Phase 2｜连通性与端到端验证（我）
   - 只读测试两个端点（状态码与片段）；在主域执行抽牌→解读验证；若异常，给出最少操作提示。
   - 验收标准：主域 Network 出现后端代理 POST，返回体含 `core/actions/warnings`；页面展示结构化解读。

4) Phase 3｜上线与回归（共同）
   - 正常运行后，观察 Runtime Logs 与用户反馈；如遇静态资源或绑定问题，按“一键式指引”操作并复验。
   - 可选：增加限流与轻鉴权（`X-API-Token`），由后端 IDE落地；我在前端注入非敏感令牌。

### 常见故障与责任分工
- 400 INVALID_ARGUMENT（Gemini 模型）：后端修复上游 URL 版本与 body 结构（v1beta + 透传 contents/parts/text）。
- 404（Zhipu 路由）：后端新增并正确命名路由文件，确保路径落到 `/api/ai/zhipu`。
- 504/5xx 超时与上游错误：后端检查网络/配额/模型可用性；我端保留总超时回退与用户无崩溃体验。
- 主域静态资源异常：我端给出 `Promote→Redeploy→Refresh→无痕强刷` 指引，执行后端/前端部署按钮并复验。

### 谁先谁后（清单视图）
- 先找我：参数与规范确认、联调计划下发、只读检测与端到端验证、故障最少操作指引。
- 再找后端 IDE：具体路由实现/修复、CORS与日志、安全运维、Redeploy 后通知我复验。
- 到哪一步找谁：
  - 联调前：我下发规范与计划。
  - 路由实现：后端 IDE 完成并 Redeploy。
  - 连通性/端到端验证：我执行并回报；如异常，后端 IDE按指引修复；我复验通过后进入上线与回归。

