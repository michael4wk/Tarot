/**
 * 开发环境专用：图片映射全覆盖校验器
 * 基于 Tarot API 的78张标准卡牌，验证图片映射是否完整覆盖
 */

import { getCardImagePath, getCardImageFilename, type TarotCardLite } from './images';

// API 标准的78张卡牌配置（与 tarotService.ts 的 buildLocalFallback78 保持一致）
const STANDARD_78_CARDS: TarotCardLite[] = [
  // 22张大阿卡纳
  ...[
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
  ].map((value, index) => ({
    type: 'major' as const,
    value,
    suit: undefined,
  })),

  // 56张小阿卡纳 = 4花色 × 14等级
  ...(['cups', 'wands', 'swords', 'pentacles'] as const).flatMap((suit) =>
    [
      'ace',
      'two',
      'three',
      'four',
      'five',
      'six',
      'seven',
      'eight',
      'nine',
      'ten',
      'page',
      'knight',
      'queen',
      'king',
    ].map((value) => ({
      type: 'minor' as const,
      value,
      suit,
    })),
  ),
];

export interface ValidationResult {
  total: number;
  found: number;
  missing: Array<{
    card: TarotCardLite;
    expectedFilename: string;
    actualUrl: string;
    isFallback: boolean;
  }>;
  report: string;
}

/**
 * 验证所有78张卡牌的图片映射
 * @returns 验证结果，包含缺失项和报告
 */
export function validateImageMappingCoverage(): ValidationResult {
  const missing: ValidationResult['missing'] = [];
  let found = 0;

  // 获取卡背URL用于比较（通过故意触发兜底逻辑）
  const fallbackUrl = getCardImagePath({ type: 'major', value: 'non-existent-card-xxx' } as any);

  for (const card of STANDARD_78_CARDS) {
    const expectedFilename = getCardImageFilename(card);
    const actualUrl = getCardImagePath(card);
    const isFallback = actualUrl === fallbackUrl;

    if (isFallback) {
      missing.push({
        card,
        expectedFilename,
        actualUrl,
        isFallback: true,
      });
    } else {
      found++;
    }
  }

  // 生成报告
  const report = [
    `=== 图片映射覆盖率校验 ===`,
    `总计: ${STANDARD_78_CARDS.length} 张`,
    `已映射: ${found} 张`,
    `缺失: ${missing.length} 张`,
    `覆盖率: ${((found / STANDARD_78_CARDS.length) * 100).toFixed(1)}%`,
    '',
    missing.length > 0 ? '缺失的卡牌映射:' : '✅ 所有卡牌均已正确映射',
    ...missing.map((item) => {
      const { card, expectedFilename } = item;
      const cardName =
        card.type === 'major'
          ? `大阿卡纳: ${card.value}`
          : `小阿卡纳: ${card.value} of ${card.suit}`;
      return `  - ${cardName} → ${expectedFilename}`;
    }),
  ].join('\n');

  return {
    total: STANDARD_78_CARDS.length,
    found,
    missing,
    report,
  };
}

/**
 * 仅在开发环境输出校验报告到控制台
 */
export function logValidationReport(): ValidationResult {
  const result = validateImageMappingCoverage();

  if (import.meta.env.DEV) {
    console.group('📸 图片映射校验');
    console.log(result.report);
    if (result.missing.length > 0) {
      console.warn('发现图片映射缺失，这可能导致部分卡牌显示为卡背');
    }
    console.groupEnd();
  }

  return result;
}

/**
 * 手动诊断特定卡牌的映射情况
 */
export function diagnoseSpecificCard(type: 'major' | 'minor', value: string, suit?: string): void {
  if (import.meta.env.DEV) {
    const card: TarotCardLite = { type, value, suit: suit as any };
    const filename = getCardImageFilename(card);
    const url = getCardImagePath(card);
    const fallbackUrl = getCardImagePath({ type: 'major', value: 'non-existent-xxx' } as any);
    const isFallback = url === fallbackUrl;

    console.group(`🔍 卡牌诊断: ${type === 'major' ? value : `${value} of ${suit}`}`);
    console.log('预期文件名:', filename);
    console.log('实际URL:', url);
    console.log('是否回退卡背:', isFallback ? '是 ❌' : '否 ✅');
    console.groupEnd();
  }
}
