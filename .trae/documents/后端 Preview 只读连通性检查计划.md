## 将执行的只读检查
- 基础域：`https://tarot-backend-lfp8n7t60-michael4wks-projects.vercel.app`
- 端点测试：
  - `POST /api/ai/gemini/generate`，体为 `{"contents":[{"role":"user","parts":[{"text":"{\"core\":\"连通性自检\",\"actions\":[\"a1\",\"a2\"],\"warnings\":[\"w1\"]}"}]}]}`
  - `POST /api/ai/zhipu`，体为 `{ "model": "glm-4-flash", "messages": [{ "role": "user", "content": "{\"core\":\"连通性自检\"}" }] }`
- 记录：状态码、响应体片段，判断路由存在、上游调用与体格式是否正确。

## 输出
- 两路端点状态与结论（通过/需要修复），以及下一步最少操作（若需要 Redeploy 或合并到 main）。