## 将执行的只读检查
- 基础域：`https://tarot-backend-manjkxz0d-michael4wks-projects.vercel.app`
- 端点测试：
  - `POST /api/ai/gemini/generate`，体：`{"contents":[{"role":"user","parts":[{"text":"{\"core\":\"连通性自检\",\"actions\":[\"a1\",\"a2\"],\"warnings\":[\"w1\"]}"}]}]}`
  - `POST /api/ai/zhipu`，体：`{"model":"glm-4-flash","messages":[{"role":"user","content":"{\"core\":\"连通性自检\"}"}]}`
- 记录状态码与响应片段，判断是否已修复 Gemini 400 并确认 Zhipu仍为 200。

## 输出
- 两端点检验结果与下一步操作（通过→前端生产端到端；不通过→最少修复建议）。