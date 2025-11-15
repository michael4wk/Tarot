## 操作清单
- 合并 dev 到 main 并推送，触发 Vercel 生产构建。
- 你在 Vercel 前端项目（Tarot2）的 Production 作用域需准备环境变量：
  - `VITE_ENABLE_AI_READING=true`
  - `VITE_AI_DEV_PROXY=0`
  - `VITE_AI_BASE_URL=https://tarotpro-backend.vercel.app`
  - 可选：`VITE_GEMINI_MODEL`、`VITE_ZHIPU_MODEL`、`VITE_AI_TIMEOUT_MS`
- 冒烟验证：访问 `https://tarotpro.vercel.app`，执行“开始解读”，Network 应出现 `POST https://tarotpro-backend.vercel.app/api/ai/...`。

## 我将执行的命令
1) 拉取远端并切换到 `main`
2) 合并 `dev` → `main`
3) 推送 `main` 到远端，等待 Vercel 自动构建

## 验证点
- 构建完成后主页可正常访问；
- 抽牌与卡背一致；
- 若环境变量已配置好，开始解读能走后端端点。