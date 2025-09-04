# Tarot API 使用指南

## 📋 API基本信息
- **官网**：https://tarotapi.dev/
- **特点**：完全免费，无需注册，无限制调用
- **数据源**：韦特塔罗牌（Rider-Waite-Smith）78张完整牌组
- **内容**：牌名、简称、正逆位含义、详细描述

## 🚀 API端点详解

### 1. 随机抽牌
```bash
# 抽取一张随机牌
GET https://tarotapi.dev/api/v1/cards/random

# 抽取多张牌（最多78张）
GET https://tarotapi.dev/api/v1/cards/random?n=3
```

### 2. 获取所有牌
```bash
# 获取全部78张牌
GET https://tarotapi.dev/api/v1/cards

# 注意：不支持type参数过滤，需要客户端过滤
# 大阿卡纳：type === "major"
# 小阿卡纳：type === "minor"
```

### 3. 搜索特定牌
```bash
# 根据关键词搜索（搜索name、meaning_up、meaning_rev字段）
GET https://tarotapi.dev/api/v1/cards/search?q=fool

# 根据正位含义搜索
GET https://tarotapi.dev/api/v1/cards/search?meaning=peace

# 根据逆位含义搜索
GET https://tarotapi.dev/api/v1/cards/search?meaning_rev=conflict
```

### 4. 获取特定牌
```bash
# 根据简称获取特定牌
GET https://tarotapi.dev/api/v1/cards/ar00    # 愚人牌
GET https://tarotapi.dev/api/v1/cards/cupa    # 圣杯A
```

## 📊 返回数据结构

### 随机抽牌返回结构
```json
{
  "nhits": 1,                   // 返回的卡牌数量
  "cards": [
    {
      "name": "The Fool",       // 完整牌名
      "name_short": "ar00",     // 简称（ar=大阿卡纳，cu/sw/wa/pe=小阿卡纳）
      "value": "fool",          // 值标识
      "value_int": 0,           // 数字值
      "suit": "major",          // 花色（major/cups/swords/wands/pentacles）
      "type": "major",          // 类型（major/minor）
      "meaning_up": "...",      // 正位含义
      "meaning_rev": "...",     // 逆位含义
      "desc": "..."             // 牌面详细描述
    }
  ]
}
```

### 标准化后的数据结构（推荐）
```json
{
  "id": "ar00_0",               // 唯一标识符（简化格式：name_short + 索引）
  "name": "The Fool",           // 完整牌名
  "nameEn": "The Fool",         // 英文牌名
  "nameShort": "ar00",          // 简称
  "value": "fool",              // 值标识
  "valueInt": 0,                // 数字值
  "suit": "major",              // 花色
  "type": "major",              // 类型
  "meaningUp": "...",           // 正位含义
  "meaningRev": "...",          // 逆位含义
  "description": "...",         // 牌面详细描述
  "isReversed": false,          // 正逆位状态（本地生成）
  // 推荐只保留 frontSrc 字段，以下两个字段若保留，请与 frontSrc 对齐
  "frontSrc": "<由 getCardImagePath 生成>",
  "img": "<同 frontSrc>",
  "image": "<同 frontSrc>"
  "keywords": [],               // 关键词数组
  "element": "灵",              // 对应元素
  "astrology": "天王星"          // 占星对应
}
```

### 单个卡牌返回结构
```json
{
  "name": "The Fool",           // 完整牌名
  "name_short": "ar00",         // 简称
  "value": "fool",              // 值标识
  "value_int": 0,               // 数字值
  "suit": "major",              // 花色
  "type": "major",              // 类型
  "meaning_up": "...",          // 正位含义
  "meaning_rev": "...",         // 逆位含义
  "desc": "..."                 // 牌面详细描述
}
```

### ⚠️ 重要说明
- **API不提供图片**：需要自行准备卡牌图片资源
- **推荐图片源**：https://www.sacred-texts.com/tarot/xr/index.htm （公共领域）
- **数据结构差异**：注意随机抽牌和单个卡牌的返回结构不同
- **数据标准化**：建议对API返回数据进行标准化处理，添加唯一标识符
- **数据一致性**：使用唯一标识符索引机制确保数据统一性

## 🔄 数据标准化流程（v2.0.0）

### 唯一标识符生成规则
```javascript
// 生成唯一标识符的函数（简化版本）
function generateUniqueId(card, index) {
  // 格式：{name_short}_{index} 或 {name}_{index}
  const identifier = card.name_short || card.name;
  return `${identifier}_${index}`;
}

// 示例
const card = { name_short: "ar00", name: "The Fool" };
const uniqueId = generateUniqueId(card, 0); // "ar00_0"
```

### 数据标准化处理类（简化版本）
```javascript
class TarotDataStandardizer {
  constructor() {
    // 移除复杂的版本控制，专注核心功能
  }
  
  // 标准化单张卡牌数据
  standardizeCard(rawCard, index) {
    return {
      id: this.generateUniqueId(rawCard, index),
      name: rawCard.name,
      nameEn: rawCard.name,
      nameShort: rawCard.name_short,
      value: rawCard.value,
      valueInt: rawCard.value_int,
      suit: rawCard.suit,
      type: rawCard.type,
      meaningUp: rawCard.meaning_up,
      meaningRev: rawCard.meaning_rev,
      description: rawCard.desc,
      isReversed: false, // 默认正位，后续随机分配
      // 使用图片映射工具生成本地资源 URL（统一走 Vite 资源管线），避免手写/拼接路径
      frontSrc: getCardImagePath({
        type: rawCard.type,
        value: rawCard.value,
        suit: rawCard.suit
      }),
      // 兼容旧字段：保持 img/image 与 frontSrc 一致（推荐逐步迁移只用 frontSrc）
      img: getCardImagePath({ type: rawCard.type, value: rawCard.value, suit: rawCard.suit }),
      image: getCardImagePath({ type: rawCard.type, value: rawCard.value, suit: rawCard.suit }),
      keywords: this.extractKeywords(rawCard),
      element: this.getCardElement(rawCard),
      astrology: this.getCardAstrology(rawCard)
    };
  }
  
  // 标准化卡牌数组
  standardizeCards(rawCards) {
    return rawCards.map((card, index) => this.standardizeCard(card, index));
  }
  
  // 生成唯一标识符（简化版本）
  generateUniqueId(card, index) {
    const identifier = card.name_short || card.name;
    return `${identifier}_${index}`;
  }
  
  // 基础数据完整性验证（简化版本）
  validateCardData(card) {
    return card.id && card.name && card.meaningUp && card.meaningRev;
  }
  
  // 辅助方法
  extractKeywords(card) {
    return card.meaning_up ? card.meaning_up.split('，').slice(0, 3) : [];
  }
  
  getCardElement(card) {
    const elements = {
      'cups': '水', 'swords': '风', 'wands': '火', 'pentacles': '土', 'major': '灵'
    };
    return elements[card.suit] || '未知';
  }
  
  getCardAstrology(card) {
    // 简化的占星映射
    return card.name_short === 'ar00' ? '天王星' : '';
  }
}
```

## 💻 JavaScript集成示例

> 资源映射导入
```javascript
// 在 Vue/Vite 项目中，按如下方式导入图片映射工具：
import { getCardImagePath, attachFrontSrc } from '@/utils/images';
```

### 基础调用（使用数据标准化）
```javascript
// 初始化数据标准化器
const standardizer = new TarotDataStandardizer();

// 抽取随机牌（单张）- 标准化版本
async function drawRandomCard() {
  try {
    const response = await fetch('https://tarotapi.dev/api/v1/cards/random');
    const result = await response.json();
    // 注意：返回结构是 {nhits: 1, cards: [...]}
    // 标准化原始数据
    const rawCard = result.cards[0];
    const standardizedCard = standardizer.standardizeCard(rawCard, 0);
    
    // 验证数据完整性
    if (!standardizer.validateCardData(standardizedCard)) {
      throw new Error('卡牌数据验证失败');
    }
    
    return standardizedCard;
  } catch (error) {
    console.error('API调用失败:', error);
    return null;
  }
}

// 抽取多张牌 - 标准化版本
async function drawMultipleCards(count = 3) {
  try {
    const response = await fetch(`https://tarotapi.dev/api/v1/cards/random?n=${count}`);
    const result = await response.json();
    
    // 标准化所有卡牌数据
    const standardizedCards = standardizer.standardizeCards(result.cards || []);
    
    // 验证所有卡牌数据
    const validCards = standardizedCards.filter(card => standardizer.validateCardData(card));
    
    if (validCards.length !== standardizedCards.length) {
      console.warn(`${standardizedCards.length - validCards.length} 张卡牌数据验证失败`);
    }
    
    return validCards;
  } catch (error) {
    console.error('API调用失败:', error);
    return [];
  }
}

// 获取所有卡牌并过滤
async function getAllCards(type = 'all') {
  try {
    const response = await fetch('https://tarotapi.dev/api/v1/cards');
    const cards = await response.json();
    
    if (type === 'major') {
      return cards.filter(card => card.type === 'major');
    } else if (type === 'minor') {
      return cards.filter(card => card.type === 'minor');
    }
    return cards;
  } catch (error) {
    console.error('API调用失败:', error);
    return [];
  }
}
```

### Vue.js组件集成
```javascript
// TarotCard.vue
export default {
  data() {
    return {
      currentCard: null,
      isLoading: false
    }
  },
  methods: {
    async drawCard() {
      this.isLoading = true;
      try {
        const response = await fetch('https://tarotapi.dev/api/v1/cards/random');
        this.currentCard = await response.json();
      } catch (error) {
        this.$toast.error('抽牌失败，请重试');
      } finally {
        this.isLoading = false;
      }
    }
  }
}
```

## 🎯 项目中的应用场景

### 1. 单张抽牌
- 日运势查询
- 简单问题解答
- 冥想引导

### 2. 三张牌阵
- 过去-现在-未来
- 问题-行动-结果
- 身心灵平衡

### 3. 复杂牌阵
- 凯尔特十字
- 关系牌阵
- 决策牌阵

## 🔧 错误处理与备选方案

### 本地备份数据
当API不可用时，可以使用本地备份数据：

```javascript
const fallbackCards = [
  {
    name: "The Fool",
    name_short: "ar00",
    value: "fool",
    value_int: 0,
    suit: "major",
    type: "major",
    meaning_up: "新的开始，冒险精神，纯真",
    meaning_rev: "鲁莽，缺乏计划，愚蠢的决定",
    desc: "愚人代表新的开始和无限的可能性。",
    // 注意：使用图片映射工具生成图片 URL（避免硬编码）
    frontSrc: getCardImagePath({ type: 'major', suit: 'major', value: 'fool' })
  },
  // ... 更多卡牌数据（建议包含完整78张牌）
];

// 带超时和重试的API调用
async function fetchWithTimeout(url, timeout = 5000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, { 
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// 智能备选方案
async function drawCardWithFallback(count = 1) {
  try {
    // 尝试API调用
    const result = await fetchWithTimeout(
      `https://tarotapi.dev/api/v1/cards/random?n=${count}`
    );
    
    // 为API返回的卡牌批量生成图片 URL（frontSrc），避免字符串拼接
    const cardsWithImages = attachFrontSrc(result.cards).map(card => ({
      ...card,
      // 统一使用 frontSrc，若仍需 image_url 可映射为同值
      image_url: card.frontSrc,
      // 添加其他本地增强数据
      keywords: extractKeywords(card),
      element: getCardElement(card),
      astrology: getCardAstrology(card)
    }));
    
    return count === 1 ? cardsWithImages[0] : cardsWithImages;
  } catch (error) {
    console.warn('API不可用，使用本地备份:', error.message);
    
    // 使用本地备份数据
    const shuffled = [...fallbackCards].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, count);
    
    return count === 1 ? selected[0] : selected;
  }
}

// 辅助函数
function extractKeywords(card) {
  // 从含义中提取关键词
  const upKeywords = card.meaning_up.split('，').map(k => k.trim());
  const revKeywords = card.meaning_rev.split('，').map(k => k.trim());
  return { up: upKeywords, rev: revKeywords };
}

function getCardElement(card) {
  // 根据花色返回元素
  const elements = {
    'cups': '水',
    'swords': '风', 
    'wands': '火',
    'pentacles': '土',
    'major': '灵'
  };
  return elements[card.suit] || '未知';
}

function getCardAstrology(card) {
  // 返回占星对应（需要完整的映射表）
  const astrologyMap = {
    'ar00': '天王星',
    'ar01': '水星',
    // ... 更多映射
  };
  return astrologyMap[card.name_short] || '';
}

class TarotAPIService {
  constructor() {
    this.baseURL = 'https://tarotapi.dev/api/v1';
    this.standardizer = new TarotDataStandardizer();
    this.fallbackCards = fallbackCards; // 使用上面定义的备份数据
    this.cardIndexMap = new Map(); // 简化的卡牌索引映射
  }

  // 获取单张随机卡牌（标准化）
  async getRandomCard() {
    const card = await drawCardWithFallback(1);
    if (card && card.id) {
      this.cardIndexMap.set(card.id, card);
    }
    return card;
  }

  // 获取多张随机卡牌（标准化）
  async getRandomCards(count) {
    const cards = await drawCardWithFallback(count);
    if (cards && cards.length > 0) {
      cards.forEach(card => {
        if (card.id) {
          this.cardIndexMap.set(card.id, card);
        }
      });
    }
    return cards;
  }

  // 通过唯一标识符获取卡牌
  getCardById(id) {
    return this.cardIndexMap.get(id) || null;
  }

  // 获取本地备份卡牌（标准化）
  getFallbackCard() {
    const randomIndex = Math.floor(Math.random() * this.fallbackCards.length);
    const rawCard = this.fallbackCards[randomIndex];
    const standardizedCard = this.standardizer.standardizeCard(rawCard, randomIndex);
    if (standardizedCard.id) {
      this.cardIndexMap.set(standardizedCard.id, standardizedCard);
    }
    return standardizedCard;
  }

  // 基础数据验证（简化版本）
  validateCards(cards) {
    return cards.every(card => this.standardizer.validateCardData(card));
  }
}
```

## 📈 性能优化建议

### 1. 缓存策略
```javascript
// 缓存所有牌数据，减少API调用
class TarotCache {
  constructor() {
    this.allCards = null;
    this.cacheTime = null;
    this.CACHE_DURATION = 24 * 60 * 60 * 1000; // 24小时
  }

  async getAllCards() {
    if (this.isValidCache()) {
      return this.allCards;
    }
    
    const response = await fetch('https://tarotapi.dev/api/v1/cards');
    this.allCards = await response.json();
    this.cacheTime = Date.now();
    
    return this.allCards;
  }

  isValidCache() {
    return this.allCards && 
           this.cacheTime && 
           (Date.now() - this.cacheTime) < this.CACHE_DURATION;
  }
}
```

### 2. 本地随机抽牌
```javascript
// 获取一次所有牌，本地实现随机抽牌
async function setupLocalDraw() {
  const allCards = await fetch('https://tarotapi.dev/api/v1/cards').then(r => r.json());
  
  return {
    drawRandom: () => allCards[Math.floor(Math.random() * allCards.length)],
    drawMultiple: (n) => {
      const shuffled = [...allCards];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled.slice(0, n);
    }
  };
}
```

## ✅ 集成检查清单

### 基础功能
- [ ] API连接测试通过
- [ ] 错误处理机制完善
- [ ] 本地缓存策略实现
- [ ] 备选方案准备
- [ ] 性能优化完成
- [ ] 用户体验优化

### 数据标准化（v2.0.0简化版）
- [ ] TarotDataStandardizer类实现完成
- [ ] 唯一标识符生成机制测试通过
- [ ] 基础数据完整性验证功能正常
- [ ] 卡牌索引映射机制工作正常
- [ ] 标准化数据结构符合规范

### 集成测试
- [ ] 单张卡牌抽取和标准化测试
- [ ] 多张卡牌抽取和标准化测试
- [ ] 唯一标识符索引查询测试
- [ ] 基础数据验证测试
- [ ] API降级和备选方案测试

## 🎉 总结

Tarot API结合我们的数据标准化机制，为塔罗牌应用提供了：

### 核心优势
- ✅ **完整数据源**：78张韦特塔罗牌完整数据
- ✅ **详细含义**：正逆位含义和牌面描述
- ✅ **完全免费**：无需注册，无限制调用
- ✅ **易于集成**：RESTful API，简单易用
- ✅ **稳定可靠**：成熟的第三方服务

### v2.0.0 数据标准化增强（简化版）
- 🆕 **唯一标识符**：每张卡牌具有简洁的唯一标识符（如：ar00_0）
- 🆕 **数据统一性**：通过索引映射确保卡牌数据统一访问
- 🆕 **基础验证**：简化的数据完整性检查机制
- 🆕 **标准化结构**：统一的数据格式，移除复杂版本控制
- 🆕 **快速查询**：通过唯一标识符快速查找卡牌

### 技术保障
- 🛡️ **错误处理**：完善的降级和备选机制
- 🛡️ **性能优化**：本地缓存和简化索引映射
- 🛡️ **数据验证**：实用的基础数据完整性检查
- 🛡️ **简洁架构**：移除过度复杂的验证机制，专注核心功能

**这为我们的塔罗牌应用v2.0.0提供了坚实可靠的数据基础！** 🔮✨