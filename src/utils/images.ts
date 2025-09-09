/*
 * 图片映射工具（getCardImagePath）
 * 目标：将 Tarot API（或标准化后的域模型）中的卡牌信息，映射为项目内静态资源图片 URL。
 * - 不改动任意组件 API（CardGrid/RevealCard 依旧通过 frontSrc 接收 URL）
 * - 通过 import.meta.glob 建立“文件名 -> URL”的索引，避免硬编码 URL 和提高可维护性
 * - 覆盖 78 张牌（22 大阿卡纳 + 56 小阿卡纳），其中文件命名与 API 字段存在差异时通过映射表/规则修正
 * - 提供兜底：若未找到图片，返回统一卡背（src/assets/images/card_back.svg）并打印告警
 */

// 说明：本文件位于 src/utils/，而图片资源位于：
// - 项目根目录：assets/images/cards/*.png（卡牌正面，78 张）
// - src 目录：src/assets/images/card_back.svg（卡背，兜底与覆盖层使用）

export type ArcanaType = 'major' | 'minor' | 'Major' | 'Minor';
export type SuitType = 'wands' | 'cups' | 'swords' | 'pentacles';

export interface TarotCardLite {
  // 大阿卡纳: { type: 'major', value: 'fool' | 'magician' | 'high_priestess' | ... }
  // 小阿卡纳: { type: 'minor', suit: 'cups' | 'swords' | 'wands' | 'pentacles', value: 'two' | 'ace' | 'queen' | ... }
  type: ArcanaType; // 来自 API 的类型（大小写均可）
  value: string; // 大阿：主牌名 slug；小阿：rank 英文（two/three/.../ten/ace/page/knight/queen/king）
  suit?: SuitType; // 小阿卡纳必需，表示花色
}

// 1) 建立 cards 目录下所有 png 的索引：key 为文件相对路径，value 为构建产出的 URL
//    eager + import: 'default' 可以直接得到每个资源的最终 URL 字符串
const cardsGlob = import.meta.glob('../../assets/images/cards/*.png', {
  eager: true,
  import: 'default',
}) as Record<string, string>;

// 2) 反向索引：以基础文件名（不含路径）作为 key，便于通过规则生成文件名后直接查找
const fileIndex = new Map<string, string>();
for (const [path, url] of Object.entries(cardsGlob)) {
  const base = path.split('/').pop()!; // e.g. "major_arcana_fool.png"
  fileIndex.set(base, url);
}

// 3) 卡背兜底：使用 src 下的卡背，避免与根级 assets 重名造成混淆
const cardBackUrl = new URL('../assets/images/card_back.svg', import.meta.url).toString();

// 4) 大阿卡纳异常映射表：API 的 value → 文件 slug
//    - high_priestess → priestess
//    - wheel_of_fortune → fortune
//    - hanged_man → hanged
const MAJOR_EXCEPTIONS: Record<string, string> = {
  high_priestess: 'priestess',
  wheel_of_fortune: 'fortune',
  hanged_man: 'hanged',
};

// 新增：大阿卡纳的“权威顺序表”（0..21）与辅助映射，
// 用于将 API 可能返回的多种写法（数字/英文数字/罗马数字/含 The_ 前缀的名称）统一到 slug。
const MAJOR_ORDER_SLUGS: readonly string[] = [
  'fool',
  'magician',
  'high_priestess',
  'empress',
  'emperor',
  'hierophant',
  'lovers',
  'chariot',
  'strength',
  'hermit',
  'wheel_of_fortune',
  'justice',
  'hanged_man',
  'death',
  'temperance',
  'devil',
  'tower',
  'star',
  'moon',
  'sun',
  'judgement',
  'world',
];
const MAJOR_SLUG_SET = new Set(MAJOR_ORDER_SLUGS);
const ROMAN_TO_NUM: Record<string, number> = {
  i: 1,
  ii: 2,
  iii: 3,
  iv: 4,
  v: 5,
  vi: 6,
  vii: 7,
  viii: 8,
  ix: 9,
  x: 10,
  xi: 11,
  xii: 12,
  xiii: 13,
  xiv: 14,
  xv: 15,
  xvi: 16,
  xvii: 17,
  xviii: 18,
  xix: 19,
  xx: 20,
  xxi: 21,
};
const WORDNUM_TO_NUM: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  twenty_one: 21,
  twentyone: 21,
};

/**
 * 归一化大阿卡纳的 value：
 * - 支持数字（"0".."21"）、英文数字（"zero".."twenty_one"）、罗马数字（"i".."xxi"）
 * - 兼容可选的 "the_" 前缀（例如 "the_chariot" → "chariot"）
 * - 若本身已是我们维护的 slug 或异常映射键，则直接返回
 */
export function normalizeMajorValueToSlug(raw: string): string {
  let s = (raw || '')
    .trim()
    .toLowerCase()
    .replace(/[\s\-]+/g, '_');
  if (!s) return s;

  // 去除可选前缀 "the_"（API/第三方来源偶尔带有该前缀）
  s = s.replace(/^the_/, '');

  // 若已是我们认可的 slug 或属于异常映射键，则直接返回
  if (MAJOR_SLUG_SET.has(s) || s in MAJOR_EXCEPTIONS) return s;

  // 纯数字 → 直接按 0..21 映射
  if (/^\d+$/.test(s)) {
    const idx = parseInt(s, 10);
    if (idx >= 0 && idx <= 21) return MAJOR_ORDER_SLUGS[idx];
  }

  // 英文数字词 → 0..21
  if (s in WORDNUM_TO_NUM) {
    const idx = WORDNUM_TO_NUM[s];
    return MAJOR_ORDER_SLUGS[idx];
  }

  // 罗马数字 → 1..21（注意：0 无罗马数字，对应 Fool）
  if (s in ROMAN_TO_NUM) {
    const idx = ROMAN_TO_NUM[s];
    return MAJOR_ORDER_SLUGS[idx];
  }

  // 兜底：返回标准化后的原值（允许后续异常表再修）
  return s;
}

// 5) 小阿卡纳 rank 规则映射：API 的 value → 文件名中的 rank
const RANK_MAP: Record<string, string> = {
  ace: 'ace',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  ten: '10',
  // 宫廷牌
  page: 'page',
  knight: 'knight',
  queen: 'queen',
  king: 'king',
  // 兼容性兜底（某些来源可能写 one/1），非塔罗标准但不影响健壮性
  one: 'ace',
  '1': 'ace',
};

function normalizeType(t: ArcanaType): 'major' | 'minor' {
  return t.toLowerCase() as 'major' | 'minor';
}

/**
 * 根据卡牌信息计算对应的图片基础文件名（不含路径）。
 * 该方法与实际 URL 生成解耦合，便于单测直接断言文件名是否如预期。
 */
export function getCardImageFilename(card: TarotCardLite): string {
  const type = normalizeType(card.type);

  if (type === 'major') {
    // 大阿：major_arcana_{slug}.png
    // 重要修复：某些远端数据源会将大阿卡纳的 value 返回为数字（"1".."21"）、
    // 英文数字（"zero"..）或罗马数字（"xii" 等）。
    // 这里先归一化为我们维护的 slug，再应用异常映射表以匹配资源文件名。
    const canonical = normalizeMajorValueToSlug(card.value || '');
    const slug = MAJOR_EXCEPTIONS[canonical] ?? canonical; // 应用异常映射
    return `major_arcana_${slug}.png`;
  }

  // 小阿：minor_arcana_{suit}_{rank}.png
  const suit = (card.suit || '').trim().toLowerCase();
  const rawRank = (card.value || '').trim().toLowerCase();
  const rank = RANK_MAP[rawRank] ?? rawRank; // 将英文数字词映射为 2..10；宫廷/ace 原样或修正
  return `minor_arcana_${suit}_${rank}.png`;
}

/**
 * 主函数：返回图片 URL。
 * - 若能在索引中找到对应文件名，则返回构建产出的 URL
 * - 否则返回卡背并打印警告（便于在开发/测试阶段发现缺失资源）
 */
export function getCardImagePath(card: TarotCardLite): string {
  const filename = getCardImageFilename(card);
  const url = fileIndex.get(filename);
  if (url) return url;

  // 未命中：输出警告并回退卡背
  if (import.meta.env?.MODE !== 'production') {
    // 在测试/开发期输出更可观测的告警
    // eslint-disable-next-line no-console
    console.warn(`[images] 未找到卡牌图片文件：${filename}，已回退为卡背。`);
  }
  return cardBackUrl;
}

/**
 * 批量辅助：将输入数组转换为 frontSrc 字段。不会改变原对象，返回浅拷贝数组。
 */
export function attachFrontSrc<T extends { type: ArcanaType; value: string; suit?: SuitType }>(
  items: T[],
): Array<T & { frontSrc: string }> {
  return items.map((it) => ({ ...it, frontSrc: getCardImagePath(it) }));
}
