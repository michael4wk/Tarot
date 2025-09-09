/*
 * 单元测试：toZhMajor 的归一化与中文名映射
 * 目标：覆盖大阿卡纳 0~21 的多种写法（数字/英文数字/罗马数字/the_ 前缀/标准 slug），
 *       确保最终中文名与专业译名一致，避免出现“10”等未规范化值渲染到 UI。
 */
import { describe, it, expect } from 'vitest';
import { toZhMajor, toZhSuit, toZhRank, suitElementZh } from './tarotI18n';

// 依据项目内权威顺序（0..21）对应的中文专业译名
// 顺序与 Rider–Waite–Smith 常见序列一致，用于校验各种输入写法归一化后的中文名
const MAJOR_ZH_BY_INDEX = [
  '愚者',
  '魔术师',
  '女祭司',
  '皇后',
  '皇帝',
  '教皇',
  '恋人',
  '战车',
  '力量',
  '隐者',
  '命运之轮',
  '正义',
  '倒吊人',
  '死神',
  '节制',
  '恶魔',
  '高塔',
  '星星',
  '月亮',
  '太阳',
  '审判',
  '世界',
] as const;

// 标准 slug → 中文名（与 src/utils/tarotI18n.ts 内 MAJOR_ZH 相对应）
const STANDARD_SLUG_CASES: Array<[string, string]> = [
  ['fool', '愚者'],
  ['magician', '魔术师'],
  ['high_priestess', '女祭司'],
  ['empress', '皇后'],
  ['emperor', '皇帝'],
  ['hierophant', '教皇'],
  ['lovers', '恋人'],
  ['chariot', '战车'],
  ['strength', '力量'],
  ['hermit', '隐者'],
  ['wheel_of_fortune', '命运之轮'],
  ['justice', '正义'],
  ['hanged_man', '倒吊人'],
  ['death', '死神'],
  ['temperance', '节制'],
  ['devil', '恶魔'],
  ['tower', '高塔'],
  ['star', '星星'],
  ['moon', '月亮'],
  ['sun', '太阳'],
  ['judgement', '审判'],
  ['world', '世界'],
];

// 英文数字写法（别名 twentyone 也支持）
const WORDNUM_CASES: Array<[string, number]> = [
  ['zero', 0],
  ['one', 1],
  ['two', 2],
  ['three', 3],
  ['four', 4],
  ['five', 5],
  ['six', 6],
  ['seven', 7],
  ['eight', 8],
  ['nine', 9],
  ['ten', 10],
  ['eleven', 11],
  ['twelve', 12],
  ['thirteen', 13],
  ['fourteen', 14],
  ['fifteen', 15],
  ['sixteen', 16],
  ['seventeen', 17],
  ['eighteen', 18],
  ['nineteen', 19],
  ['twenty', 20],
  ['twenty_one', 21],
  ['twentyone', 21], // 兼容写法
];

// 罗马数字（不含 0；大小写均应被接受）
const ROMAN_CASES: Array<[string, number]> = [
  ['i', 1],
  ['ii', 2],
  ['iii', 3],
  ['iv', 4],
  ['v', 5],
  ['vi', 6],
  ['vii', 7],
  ['viii', 8],
  ['ix', 9],
  ['x', 10],
  ['xi', 11],
  ['xii', 12],
  ['xiii', 13],
  ['xiv', 14],
  ['xv', 15],
  ['xvi', 16],
  ['xvii', 17],
  ['xviii', 18],
  ['xix', 19],
  ['xx', 20],
  ['xxi', 21],
];

// the_ 前缀写法
const THE_PREFIX_CASES: Array<[string, string]> = [
  ['the_chariot', '战车'],
  ['the_sun', '太阳'],
  ['the_world', '世界'],
];

// 异常名本身就是标准键（中文映射表中已存在）
const EXCEPTION_KEYS_CASES: Array<[string, string]> = [
  ['high_priestess', '女祭司'],
  ['wheel_of_fortune', '命运之轮'],
  ['hanged_man', '倒吊人'],
];

describe('toZhMajor 归一化与中文名映射', () => {
  it('标准 slug 应映射为正确中文名', () => {
    for (const [slug, zh] of STANDARD_SLUG_CASES) {
      expect(toZhMajor(slug)).toBe(zh);
    }
  });

  it('数字 0..21 应映射为正确中文名', () => {
    for (let i = 0; i <= 21; i++) {
      expect(toZhMajor(String(i))).toBe(MAJOR_ZH_BY_INDEX[i]);
    }
  });

  it('英文数字 zero..twenty_one/twentyone 应映射为正确中文名', () => {
    for (const [word, idx] of WORDNUM_CASES) {
      expect(toZhMajor(word)).toBe(MAJOR_ZH_BY_INDEX[idx]);
    }
  });

  it('罗马数字 i..xxi（含大小写）应映射为正确中文名', () => {
    for (const [roman, idx] of ROMAN_CASES) {
      expect(toZhMajor(roman)).toBe(MAJOR_ZH_BY_INDEX[idx]);
      expect(toZhMajor(roman.toUpperCase())).toBe(MAJOR_ZH_BY_INDEX[idx]);
    }
  });

  it('带 the_ 前缀的写法应正确去前缀并映射', () => {
    for (const [value, zh] of THE_PREFIX_CASES) {
      expect(toZhMajor(value)).toBe(zh);
    }
  });

  it('异常键（high_priestess / wheel_of_fortune / hanged_man）也应正确映射', () => {
    for (const [value, zh] of EXCEPTION_KEYS_CASES) {
      expect(toZhMajor(value)).toBe(zh);
    }
  });

  it('空/空字符串返回空字符串', () => {
    expect(toZhMajor('')).toBe('');
    expect(toZhMajor(null as unknown as string)).toBe('');
    expect(toZhMajor(undefined as unknown as string)).toBe('');
  });
});

describe('小阿尔卡那中文名与元素', () => {
  it('toZhSuit: major 类型直接返回“大阿尔卡那”；minor 花色正确映射', () => {
    expect(toZhSuit('wands', 'major')).toBe('大阿尔卡那');
    expect(toZhSuit('wands', 'minor')).toBe('权杖');
    expect(toZhSuit('cups', 'minor')).toBe('圣杯');
    expect(toZhSuit('swords', 'minor')).toBe('宝剑');
    expect(toZhSuit('pentacles', 'minor')).toBe('星币');
    // 空值处理
    expect(toZhSuit(undefined as unknown as string, 'minor')).toBe('');
  });

  it('toZhRank: 等级映射（ace,two..ten,page,knight,queen,king）', () => {
    expect(toZhRank('ace')).toBe('王牌');
    expect(toZhRank('two')).toBe('二');
    expect(toZhRank('three')).toBe('三');
    expect(toZhRank('four')).toBe('四');
    expect(toZhRank('five')).toBe('五');
    expect(toZhRank('six')).toBe('六');
    expect(toZhRank('seven')).toBe('七');
    expect(toZhRank('eight')).toBe('八');
    expect(toZhRank('nine')).toBe('九');
    expect(toZhRank('ten')).toBe('十');
    expect(toZhRank('page')).toBe('侍从');
    expect(toZhRank('knight')).toBe('骑士');
    expect(toZhRank('queen')).toBe('王后');
    expect(toZhRank('king')).toBe('国王');
    // 未知输入回退为原值
    expect(toZhRank('unknown_rank')).toBe('unknown_rank');
    // 空值
    expect(toZhRank(undefined as unknown as string)).toBe('');
  });

  it('suitElementZh: 花色→元素 映射与兜底', () => {
    expect(suitElementZh('wands')).toBe('火');
    expect(suitElementZh('cups')).toBe('水');
    expect(suitElementZh('swords')).toBe('风');
    expect(suitElementZh('pentacles')).toBe('土');
    // 未知/空值兜底为“—”
    expect(suitElementZh('unknown' as any)).toBe('—');
    expect(suitElementZh(undefined as any)).toBe('—');
  });
});