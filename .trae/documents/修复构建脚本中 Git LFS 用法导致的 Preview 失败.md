## 问题原因（来自日志）
- `Error: unknown flag: --include`：`git lfs checkout` 不支持 `--include` 参数（当前构建机的 LFS 版本），因此命令报错并中止，导致构建失败（127）。
- 之前的 `.lfsconfig` 已设置端点，`git lfs fetch` 能运行，但后续 `checkout --include=...` 报错使整个 `npm run build` 失败。

## 修复方案（更新构建脚本）
1. 修改前端 `package.json` 的 `build` 命令为兼容的 LFS 调用：
```
"build": "git lfs install || true && git lfs fetch || true && git lfs checkout assets/images/card_back.svg assets/images/card_logo.png assets/images/cards/* || true && npm ci && vite build"
```
- 说明：
  - `git lfs fetch`：使用默认端点（已由 `.lfsconfig` 指定），不传不兼容的 `--include`。
  - `git lfs checkout`：直接传具体路径/通配符 `assets/images/cards/*`，让 LFS 将对象内容写入工作副本。
  - 在 LFS 环节加 `|| true`，即便某次拉取已缓存也不阻塞。
  - 将 `npm ci` 放在 LFS 操作之后，确保图片对象就绪再打包。

2. 备选（若构建机仍无法签出对象）：在 Vercel 项目 Build Settings 中设置 Install Command：
```
git lfs install && git lfs fetch && git lfs checkout assets/images/card_back.svg assets/images/card_logo.png assets/images/cards/*
```
- 让 LFS 操作在依赖安装阶段完成，`Build Command` 仅保留 `npm ci && vite build`。

## 验证
- 新 Preview 构建日志不再出现 `unknown flag: --include`，亦无 `Skipped checkout ... content not local`。
- dist 中图片不再是 0.13 kB 指针；页面无痕访问：Logo、卡背、翻牌正面全部正常显示。

## 后续
- 验证通过后合并 `dev→main` 触发生产自动部署；后端保持已修正的 `ALLOWED_ORIGINS` 与 `GEMINI_MODEL`，进行端到端联调验收。