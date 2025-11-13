# API Keys 管理文档

## 📋 项目API密钥配置

### 1. Tarot API

- **服务名称**：Tarot API
- **官网**：https://tarotapi.dev/
- **API Key**：不需要。该公共 API 完全免费、无需注册。
- **用途**：获取78张塔罗牌的基础数据（牌名、含义、描述等）
- **特点**：完全免费，无需注册，无限制调用
- **注意**：API 不提供卡牌图片，需要使用本地图片资源；调用时不应携带任何鉴权头（例如 Authorization）。

### 2. Gemini AI API

- **服务名称**：Google Gemini AI
- **API Key**：仅在后端（Serverless/服务端）通过环境变量管理，禁止在前端注入或展示真实值
- **用途**：AI 解读生成，智能塔罗牌解释
- **模型版本**：gemini-1.5-flash（稳定版本）
- **集成方式**：后端使用官方 SDK 或 HTTPS API；前端通过后端路由转发

## 🔐 安全管理规范

### 环境变量配置（前后端分离）

#### 前端（Web）

仅保留非敏感配置；不在前端注入任何真实 API 密钥。

```bash
# 开发模式（本地）示例：放入 .env.local（不提交）
VITE_AI_DEV_PROXY=1                 # 启用本地开发代理插件，避免密钥泄露
VITE_GEMINI_MODEL=gemini-1.5-flash  # 模型选择（非敏感，可前端注入）

# 生产模式（Vercel 项目 "tarot"）示例：在 Vercel Dashboard → Settings → Environment Variables 配置
VITE_AI_DEV_PROXY=0                 # 关闭前端直连与开发代理
VITE_AI_BASE_URL=https://tarot-backend.vercel.app  # 后端基座域名（或自定义域名）
VITE_GEMINI_MODEL=gemini-1.5-flash  # 前端可见的非敏感配置
```

#### 后端（Serverless / Vercel 项目，推荐名称：tarot-backend）

所有敏感密钥只存放在后端项目的环境变量中：

```bash
# Vercel Dashboard（后端项目）中配置：
GEMINI_API_KEY=********            # Google Gemini API 密钥（敏感，不出前端）
ZHIPU_API_KEY=********             # 可选：智谱 API 密钥（敏感，不出前端）
AI_PROXY_TIMEOUT_MS=8000           # 代理超时配置（非敏感）
GEMINI_MODEL=gemini-1.5-flash      # 后端默认模型（可与前端保持一致）
ALLOWED_ORIGINS=https://tarot.vercel.app,https://your-custom-domain.com  # CORS 白名单
```

### .gitignore 配置

```gitignore
# 确保API密钥不被提交到版本控制
.env
.env.local
.env.*.local
config/keys.js
*.key
*.pem
```

### 前端调用方式（安全范式）

前端不读取任何敏感密钥；所有 AI 请求通过后端安全路由进行：

```javascript
// 从前端环境读取后端基座地址（非敏感）
const AI_BASE_URL = import.meta.env.VITE_AI_BASE_URL;

// 通过后端路由调用 Gemini（示例）
async function generateReading(payload) {
  const res = await fetch(`${AI_BASE_URL}/api/ai/gemini/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    // 不在前端携带任何密钥头；鉴权与密钥处理由后端完成
  });
  if (!res.ok) throw new Error('AI 服务不可用');
  return await res.json();
}
```

## ⚠️ 重要安全提醒

1. 绝不在代码或文档中硬编码API密钥
2. 使用环境变量管理敏感信息，并存放在 .env.local（前端仅非敏感；密钥仅后端）
3. 确保 .env\* 文件在 .gitignore 中
4. 定期轮换API密钥（发现泄露时立即更换）
5. 监控API使用量和异常调用
6. 生产环境禁止将 GEMINI_API_KEY 作为 `VITE_*` 变量注入前端；密钥只能在后端配置

## 📊 API使用监控

### Tarot API

- **调用频率**：无限制
- **响应时间**：通常 < 500ms
- **可用性**：99.9%+
- **备选方案**：本地备份数据

### Gemini AI API

- **调用限制**：根据Google配额
- **响应时间**：通常 1-3s
- **降级策略**：预设解读模板
- **成本控制**：监控token使用量

## 🔄 密钥轮换计划

- **Tarot API**：每6个月检查一次
- **Gemini AI**：每3个月轮换一次
- **紧急轮换**：发现泄露时立即更换

---

**最后更新**：2025年
**维护人员**：项目开发团队
**文档版本**：v1.2.0（前后端分离；密钥仅后端；前端不注入密钥）
