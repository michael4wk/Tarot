/*
 * Tarot 本地化与语义工具（最小可行版）
 * - 作用：提供塔罗牌基础信息的中文化（名称/花色/等级）与元素映射
 * - 约束：不引入正式 i18n 方案，避免全局侵入；仅对结果页最小依赖
 * - 备注：大阿尔卡那的“元素”存在学派差异，此处暂不武断给出，返回“—”，待需求确认后补充权威映射表
 */

// 花色中文映射（小阿尔卡那）
const SUIT_ZH: Record<string, string> = {
  wands: '权杖',
  cups: '圣杯',
  swords: '宝剑',
  pentacles: '星币',
};

// 等级中文映射（小阿尔卡那）
const RANK_ZH: Record<string, string> = {
  ace: '王牌',
  two: '二',
  three: '三',
  four: '四',
  five: '五',
  six: '六',
  seven: '七',
  eight: '八',
  nine: '九',
  ten: '十',
  page: '侍从',
  knight: '骑士',
  queen: '王后',
  king: '国王',
};

// 大阿尔卡那中文专业译名
const MAJOR_ZH: Record<string, string> = {
  fool: '愚者',
  magician: '魔术师',
  high_priestess: '女祭司',
  empress: '皇后',
  emperor: '皇帝',
  hierophant: '教皇',
  lovers: '恋人',
  chariot: '战车',
  strength: '力量',
  hermit: '隐者',
  wheel_of_fortune: '命运之轮',
  justice: '正义',
  hanged_man: '倒吊人',
  death: '死神',
  temperance: '节制',
  devil: '恶魔',
  tower: '高塔',
  star: '星星',
  moon: '月亮',
  sun: '太阳',
  judgement: '审判',
  world: '世界',
};

// 小阿尔卡那：花色 → 元素（中文）
const SUIT_ELEMENT_ZH: Record<string, string> = {
  wands: '火',
  cups: '水',
  swords: '风',
  pentacles: '土',
};

/**
 * toZhSuit：返回中文花色；当 type === 'major' 时语义上不适用，推荐在调用侧直接展示“大阿尔卡那”
 */
export function toZhSuit(suit: string | null | undefined, type: string | null | undefined): string {
  if (type === 'major') return '大阿尔卡那';
  if (!suit) return '';
  return SUIT_ZH[suit] || '';
}

/**
 * toZhRank：返回中文等级
 */
export function toZhRank(value: string | null | undefined): string {
  if (!value) return '';
  return RANK_ZH[value] || value;
}

/**
 * toZhMajor：返回大阿尔卡那中文专业译名
 */
export function toZhMajor(value: string | null | undefined): string {
  if (!value) return '';
  // 将大阿尔卡那的 value 归一化为标准 slug（支持数字/罗马数字/英文数字/the_ 前缀），
  // 以便与中文专业译名表 MAJOR_ZH 对齐。
  const canonical = normalizeMajorValueToSlug(String(value));
  return MAJOR_ZH[canonical] || canonical;
}

/**
 * suitElementZh：小阿尔卡那元素（按花色归属）
 */
export function suitElementZh(suit: string | null | undefined): string {
  if (!suit) return '—';
  return SUIT_ELEMENT_ZH[suit] || '—';
}

/**
 * majorElementZh：大阿尔卡那元素（占位：学派差异较大，暂返回“—”以保证专业严谨性）
 * TODO: 待确认正式元素/占星映射表后补齐（建议与产品/占星顾问确认 Golden Dawn/Thoth/RWS 的一致性选择）
 */
export function majorElementZh(_value: string | null | undefined): string {
  return '—';
}

import { normalizeMajorValueToSlug } from '@/utils/images';
