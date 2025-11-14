## 根因
- 构建日志显示：
  - `Invalid remote name "origin"`（没有远程或路径解析异常）
  - `missing protocol: ""`（LFS 端点未配置）
  - 导致 `Skipped checkout ... content not local`，Vite 打包进入的都是 0.13k 指针文本
- 结论：Vercel 临时构建环境没有正确的 LFS 端点，需要显式配置 GitHub LFS URL

## 修复方案
1. 在仓库根添加 `.lfsconfig`，显式定义 LFS 端点：
```
[lfs]
	url = https://github.com/michael4wk/Tarot.git/info/lfs
```
2. 调整前端 `package.json` 的构建脚本：
- 用 `.lfsconfig` 的端点拉取并签出所需对象，仅限图片目录：
```
"build": "git lfs install || true && git config -f .lfsconfig lfs.url https://github.com/michael4wk/Tarot.git/info/lfs && git lfs fetch --include='assets/images/**' && git lfs checkout --include='assets/images/**' && vite build"
```
- 说明：
  - 不再依赖 `origin` 或 `$VERCEL_GIT_COMMIT_REF`，直接用 `.lfsconfig` 端点确保可拉取
  - 限定 `assets/images/**`，稳定且高效

3. 保持已统一的代码引用（无需再改）：
- 卡背：`new URL('../../assets/images/card_back.svg', import.meta.url).toString()`
- 正面：`import.meta.glob('../../assets/images/cards/*.png', { eager: true, import: 'default' })`
- Logo：`new URL('../../assets/images/card_logo.png', import.meta.url).toString()`

4. 推送到 `dev`，等待 Preview 自动构建
- 构建日志预期：无 `missing protocol`/`Skipped checkout`；出现 `git lfs fetch` + `git lfs checkout` 成功
- dist 中图片不再是 0.13k，预览页面 Logo/卡背/正面全部正常

## 兜底（若仍失败）
- 在 Vercel 项目 Build Settings 的 Install Command 中同步执行：
```
git lfs install && git config -f .lfsconfig lfs.url https://github.com/michael4wk/Tarot.git/info/lfs && git lfs fetch --include='assets/images/**' && git lfs checkout --include='assets/images/**'
```
- 若 LFS 仍不可用，临时将 `assets/images` 拷贝到 `public` 并用固定路径引用；待 LFS 稳定后恢复构建 URL（源目录保持 assets/images 不改）

## 验收
- 新 Preview 打开无痕验证：Logo/卡背/翻牌正面全部正常
- dist 列表图片为真实二进制（MB 级）
- 通过后合并 `dev→main` 进入生产自动部署