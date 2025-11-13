# Gemini AI 集成指南 🤖

## 概述

本指南将帮助您在塔罗解读师应用中启用 Google Gemini AI，实现个性化的塔罗牌解读功能。

## 🎯 为什么需要 AI 集成？

### 当前问题

- **固定模板局限性**：预设解读内容机械化，缺乏个性化
- **用户体验差**：重复的解读内容，无法针对具体问题
- **缺乏深度**：无法结合用户问题和卡牌进行深度分析

### AI 解读优势

- **个性化解读**：结合用户具体问题和抽到的卡牌
- **深度分析**：AI 能够提供更有洞察力的解读
- **自然语言**：温和、积极且富有启发性的表达
- **一致性**：专业的塔罗解读师风格

## 🚀 快速启用步骤

### 1. 获取 Gemini API Key

1. 访问 [Google AI Studio](https://aistudio.google.com/app/apikey)
2. 登录您的 Google 账户
3. 点击 "Create API Key" 创建新的 API Key
4. 复制生成的 API Key

**重要提醒**：Google AI Studio 在所有支持的国家/地区完全免费使用，无需付费即可获取API Key。

### 1.1 验证 API Key 有效性

获取API Key后，建议使用验证工具确认其有效性：

```bash
# 在项目根目录运行验证脚本
python verify_gemini_api.py
```

**验证结果示例**：

- ✅ API Key 有效
- 📊 可访问模型：50个（6个免费模型，19个付费模型）
- 🆓 推荐免费模型：`gemini-1.5-flash`（稳定版本）
- 💰 推荐付费模型：`gemini-2.5-flash-lite`（性价比最佳）
- 📈 免费限制：每日25个请求，启用计费账户后可提升至100个请求（仍免费）

### 2. 配置环境变量（前后端分离）

不在前端注入任何真实 API 密钥；仅在后端配置敏感信息。

```env
# 前端（Web）.env.local（本地开发，不提交）
VITE_AI_DEV_PROXY=1                 # 启用开发代理，避免密钥暴露
VITE_GEMINI_MODEL=gemini-1.5-flash  # 非敏感模型选择

# 前端（生产，Vercel 项目 "tarot"）
VITE_AI_DEV_PROXY=0                 # 生产关闭前端代理
VITE_AI_BASE_URL=https://tarot-backend.vercel.app  # 后端基座地址
VITE_GEMINI_MODEL=gemini-1.5-flash  # 非敏感配置

# 后端（Vercel 项目，推荐名称：tarot-backend）
GEMINI_API_KEY=********             # 敏感密钥，仅后端
AI_PROXY_TIMEOUT_MS=8000            # 非敏感运行参数
GEMINI_MODEL=gemini-1.5-flash       # 后端默认模型
ALLOWED_ORIGINS=https://tarot.vercel.app
```

### 3. 重启开发服务器

```bash
npm run dev
```

## 💰 成本分析

### Gemini API 定价（2025年最新）

#### 免费层级（2025年最新）

- **Gemini 1.5 Flash**：免费使用，每日请求限制（RPD）根据层级而定
  - 免费层级：25 RPD（每日请求数）
  - 第1层级（启用计费账户）：100 RPD
- **Gemini 2.5 Flash**：免费层级不可用，仅付费层级可用
- **Google AI Studio**：在所有支持的国家/地区完全免费使用
- **⚠️ 重要提醒**：Gemini 2.5系列模型需要付费使用，但Gemini 1.5 Flash仍可免费使用

#### 付费层级（2025年最新定价）

- **Gemini 2.5 Flash**：输入$0.625/百万tokens，输出$5.00/百万tokens（≤20万tokens提示）
- **Gemini 2.5 Flash-Lite**：输入$0.30/百万tokens，输出$2.50/百万tokens（推荐性价比）
- **Gemini 1.5 Flash**：输入$0.075/百万tokens，输出$0.30/百万tokens（经济选择）
- **预估成本**：每次解读约 $0.001-0.005（根据版本不同）

#### 版本选择建议（基于API Key验证结果）

- **开发测试**：✅ **推荐使用 `gemini-1.5-flash`**（稳定版本，25 RPD限制）
- **小规模生产**：启用计费账户使用 `gemini-1.5-flash`（100 RPD，仍然免费）
- **生产环境（经济型）**：推荐 `gemini-2.5-flash-lite`（性价比最高）
- **生产环境（预算有限）**：使用 `gemini-1.5-flash` 付费版本
- **高质量需求**：使用 `gemini-2.5-flash`（最佳效果，成本较高）

**⚠️ 重要提醒**：根据API Key验证结果，当前可访问6个免费模型和19个付费模型。建议优先使用 `gemini-1.5-flash` 稳定版本进行开发和测试。

### 成本优化建议

1. **缓存机制**：相同问题+卡牌组合可以缓存结果
2. **用户限制**：每用户每日解读次数限制
3. **回退机制**：API 不可用时使用优化的模板
4. **版本切换**：根据使用量选择合适的API版本

## 🔧 技术实现细节

### 五段式 AI 增强解读架构（v2.3.0）

保留五段式业务架构；AI 调用改为“前端 → 后端路由 → Gemini API”的安全链路：

1. 牌面识别阶段 - 基础牌面信息提取
2. 元素能量分析 - 四大元素能量分析
3. 层次深度分析 - 多层次牌面含义解读
4. 情境融合解读 - 结合用户问题的情境化分析
5. AI 智能解读 - 后端持密钥调用 Gemini，前端仅消费结果

### 前端调用后端 API（安全示例）

```javascript
// 前端不持有密钥，通过后端路由调用 AI 服务
const AI_BASE_URL = import.meta.env.VITE_AI_BASE_URL;

export async function generateEnhancedReading(cards, question, baseReading) {
  // 统一数据验证
  validateCardData(cards);

  const payload = {
    cards,
    question,
    baseReading,
    model: import.meta.env.VITE_GEMINI_MODEL || 'gemini-1.5-flash',
  };

  const res = await fetch(`${AI_BASE_URL}/api/ai/gemini/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) throw new Error('Gemini 服务暂不可用');
  const data = await res.json();
  return parseStructuredResponse(data);
}
```

### 专业Prompt模板结构

系统使用多层次的专业Prompt模板，整合五段式解读结果：

```javascript
buildProfessionalPrompt(cards, question, baseReading) {
  return `作为专业塔罗师，基于以下信息提供深度解读：

**用户问题**: ${question}

**抽取卡牌**: ${cards.map(card =>
    `${card.name}(${card.isReversed ? '逆位' : '正位'}) [ID: ${card.uniqueId}]`
  ).join(', ')}

**基础解读框架**:
- 牌面识别: ${baseReading.cardIdentification}
- 元素能量: ${baseReading.elementalAnalysis}
- 层次分析: ${baseReading.hierarchicalAnalysis}
- 情境融合: ${baseReading.contextualIntegration}

**数据一致性验证**: 所有卡牌均通过唯一标识符验证

请提供JSON格式的增强解读，包含：
1. **深度解读** - 个性化分析
2. **实用建议** - 具体行动指导
3. **关键洞察** - 核心要点
4. **情感基调** - 心情色彩
5. **置信度** - 解读可信度(0-1)
6. **卡牌引用** - 使用唯一标识符引用具体卡牌`;
}
```

**模板特点**：

- 整合五段式基础解读结果
- 结构化JSON输出格式
- 专业塔罗师角色定位
- 置信度评估机制

## 🎨 用户体验对比

### 固定模板（当前）

```
❌ 机械化：每次相同卡牌都是相同解读
❌ 无关联：无法结合用户具体问题
❌ 浅层次：缺乏深度分析和洞察
❌ 重复性：用户体验单调乏味
```

### AI 解读（升级后）

```
✅ 个性化：每次解读都是独特的
✅ 针对性：深度结合用户问题分析
✅ 有洞察：提供富有启发性的指导
✅ 自然化：温和、积极的表达方式
```

## 🛡️ 安全与隐私

### 数据保护

- 不存储用户问题：解读完成后立即清除
- API 加密传输：HTTPS 安全连接
- 敏感信息仅在后端：前端不持有密钥；后端通过环境变量注入

### 错误处理

- API 限额：优雅降级到优化模板
- 网络异常：自动重试机制（后端最多重试 2 次）
- 解析失败：回退到备用解读
- CORS 与来源校验：后端仅允许来自 `ALLOWED_ORIGINS` 的请求

## 🏗️ 部署架构与一致性（双仓 + Vercel Hobby）

- 前端仓库（公开）：部署到 Vercel 项目 `tarot`
- 后端仓库（私有）：部署到 Vercel 项目（推荐名）`tarot-backend`
- 开发一致性：本地启用 `VITE_AI_DEV_PROXY=1`，保持与生产同等调用接口形态（均走 `/api/ai/...`）
- 生产安全：前端不注入密钥；后端通过环境变量与路由承接；CORS 白名单限制来源

## 📊 效果预期

### 用户满意度提升

- **个性化体验**：+80% 用户满意度
- **解读深度**：+60% 内容质量
- **重复使用**：+40% 用户留存

### 技术指标

- **响应时间**：2-5秒（AI 生成）
- **成功率**：99%（含回退机制）
- **成本控制**：每月 <$10（中等使用量）

## 🔄 实施计划

### 阶段一：基础集成（1天）

- [x] 环境变量配置
- [x] API Key 设置
- [x] 基础测试

### 阶段二：优化提升（2-3天）

- [ ] 提示词优化
- [ ] 错误处理完善
- [ ] 用户体验测试

### 阶段三：高级功能（1周）

- [ ] 缓存机制
- [ ] 用户限制
- [ ] 分析统计

## 🎉 结论

**强烈建议立即启用 Gemini AI 集成**：

1. **技术就绪**：代码架构完备，只需配置 API Key
2. **成本可控**：免费额度足够测试，付费成本极低
3. **体验飞跃**：从机械化模板到个性化 AI 解读
4. **竞争优势**：AI 驱动是塔罗应用的核心差异化

立即行动，让您的塔罗解读师应用真正具备"智能解读"的能力！🔮✨
