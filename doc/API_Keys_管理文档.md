# API Keys 管理文档

## 📋 项目API密钥配置

### 1. Tarot API

- **服务名称**：Tarot API
- **官网**：https://tarotapi.dev/
- **API Key**：使用环境变量管理，禁止在文档和代码中展示真实值
- **用途**：获取78张塔罗牌的基础数据（牌名、含义、描述等）
- **特点**：完全免费，无需注册，无限制调用
- **注意**：API不提供卡牌图片，需要使用本地图片资源

### 2. Gemini AI API

- **服务名称**：Google Gemini AI
- **API Key**：使用环境变量管理，禁止在文档和代码中展示真实值
- **用途**：AI解读生成，智能塔罗牌解释
- **模型版本**：gemini-1.5-flash（稳定版本）
- **集成方式**：通过Google AI SDK

## 🔐 安全管理规范

### 环境变量配置

```bash
# .env 文件配置（示例：请放入 .env.local 私有文件，不要提交到仓库）
VITE_TAROT_API_KEY=your_tarot_api_key_here
VITE_GEMINI_API_KEY=your_gemini_api_key_here

# 生产/开发模型配置示例
VITE_GEMINI_MODEL=gemini-1.5-flash
VITE_ENABLE_AI_READING=true
VITE_ENABLE_CARD_VALIDATION=true
VITE_USE_UNIQUE_ID_INDEXING=true
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

### 代码中的使用方式（Vite）

```javascript
// 通过 import.meta.env 读取 Vite 注入的环境变量
const TAROT_API_KEY = import.meta.env.VITE_TAROT_API_KEY;
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

// API调用示例
const headers = {
  Authorization: `Bearer ${TAROT_API_KEY}`,
  'Content-Type': 'application/json',
};
```

## ⚠️ 重要安全提醒

1. 绝不在代码或文档中硬编码API密钥
2. 使用环境变量管理敏感信息，并存放在 .env.local
3. 确保 .env\* 文件在 .gitignore 中
4. 定期轮换API密钥（发现泄露时立即更换）
5. 监控API使用量和异常调用

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
**文档版本**：v1.1.0（已统一 VITE\_\* 前缀，移除硬编码密钥）
