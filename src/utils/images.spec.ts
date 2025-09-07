import { describe, it, expect, vi, beforeAll } from 'vitest';
import { getCardImageFilename, getCardImagePath, type TarotCardLite } from './images';

// 为了断言兜底分支，拦截 console.warn
const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

// 获取卡背 URL（通过 getCardImagePath 对一个必定不存在的牌型触发兜底来拿到实际字符串）
let fallbackUrl = '';
beforeAll(() => {
  const missing: TarotCardLite = { type: 'major', value: 'non-exists-xxx' } as any;
  fallbackUrl = getCardImagePath(missing);
});

// 大阿卡纳完整覆盖（根据 assets/images/cards 目录实际存在的 22 张）
const majors: Array<[string, string]> = [
  // [API value, 文件 slug 或异常映射后的 slug]
  ['fool', 'fool'],
  ['magician', 'magician'],
  ['high_priestess', 'priestess'], // 异常映射
  ['empress', 'empress'],
  ['emperor', 'emperor'],
  ['hierophant', 'hierophant'],
  ['lovers', 'lovers'],
  ['chariot', 'chariot'],
  ['strength', 'strength'],
  ['hermit', 'hermit'],
  ['justice', 'justice'],
  ['hanged_man', 'hanged'], // 异常映射
  ['death', 'death'],
  ['temperance', 'temperance'],
  ['devil', 'devil'],
  ['tower', 'tower'],
  ['star', 'star'],
  ['moon', 'moon'],
  ['sun', 'sun'],
  ['judgement', 'judgement'],
  ['world', 'world'],
  ['wheel_of_fortune', 'fortune'], // 异常映射
];

// 小阿卡纳花色与 rank 全覆盖
const suits = ['cups', 'swords', 'wands', 'pentacles'] as const;
const ranksWordToFile = [
  ['ace', 'ace'],
  ['two', '2'],
  ['three', '3'],
  ['four', '4'],
  ['five', '5'],
  ['six', '6'],
  ['seven', '7'],
  ['eight', '8'],
  ['nine', '9'],
  ['ten', '10'],
  ['page', 'page'],
  ['knight', 'knight'],
  ['queen', 'queen'],
  ['king', 'king'],
] as const;

describe('images mapping - filename rule', () => {
  it('major arcana filenames (22/22)', () => {
    for (const [apiVal, slug] of majors) {
      const card: TarotCardLite = { type: 'major', value: apiVal } as any;
      const fn = getCardImageFilename(card);
      expect(fn).toBe(`major_arcana_${slug}.png`);
    }
  });

  it('minor arcana filenames (56/56)', () => {
    for (const s of suits) {
      for (const [word, fileRank] of ranksWordToFile) {
        const card: TarotCardLite = { type: 'minor', suit: s as any, value: word } as any;
        const fn = getCardImageFilename(card);
        expect(fn).toBe(`minor_arcana_${s}_${fileRank}.png`);
      }
    }
  });
});

describe('images mapping - url lookup', () => {
  it('major arcana urls exist (by subset check)', () => {
    // 取一部分具有代表性的牌，避免测试对构建器产物路径的强耦合
    const subset: string[] = ['fool', 'priestess', 'fortune', 'hanged', 'world'];
    for (const slug of subset) {
      const url = getCardImagePath({ type: 'major', value: slug } as any);
      // 注意：此处传入的 value = slug（已映射后的形式），用于验证资源存在。
      // 资源存在时，返回值应当为非兜底 URL。
      expect(url).not.toBe(fallbackUrl);
      expect(url).toContain(`major_arcana_${slug}.png`);
    }
  });

  // 新增：对 22 张大阿卡纳进行 URL 命中全覆盖校验（使用 API value，依赖异常映射规则）
  it('major arcana urls exist (22/22 full check)', () => {
    for (const [apiVal, slug] of majors) {
      const url = getCardImagePath({ type: 'major', value: apiVal } as any);
      expect(url).not.toBe(fallbackUrl);
      expect(url).toContain(`major_arcana_${slug}.png`);
    }
  });

  it('minor arcana urls exist (by subset check)', () => {
    const subset = [
      { suit: 'cups', rank: '2' },
      { suit: 'wands', rank: 'ace' },
      { suit: 'swords', rank: '10' },
      { suit: 'pentacles', rank: 'queen' },
    ] as const;

    for (const { suit, rank } of subset) {
      const url = getCardImagePath({ type: 'minor', suit, value: rank } as any);
      expect(url).not.toBe(fallbackUrl);
      expect(url).toContain(`minor_arcana_${suit}_${rank}.png`);
    }
  });

  // 新增：对 56 张小阿卡纳进行 URL 命中全覆盖校验
  it('minor arcana urls exist (56/56 full check)', () => {
    for (const s of suits) {
      for (const [word, fileRank] of ranksWordToFile) {
        const url = getCardImagePath({ type: 'minor', suit: s as any, value: word } as any);
        expect(url).not.toBe(fallbackUrl);
        expect(url).toContain(`minor_arcana_${s}_${fileRank}.png`);
      }
    }
  });

  it('fallback to card back when missing', () => {
    const url = getCardImagePath({ type: 'minor', suit: 'cups', value: '11' } as any);
    expect(url).toBe(fallbackUrl);
    expect(warnSpy).toHaveBeenCalled();
  });
});

describe('images mapping - major normalization compatibility', () => {
  // 归一化兼容性覆盖用例：数字/英文数字/罗马数字/the_ 前缀/异常映射
  // 每个元组：[输入值，期望的文件 slug]
  const cases: Array<[string, string]> = [
    ['0', 'fool'], // 数字 → 愚者
    ['zero', 'fool'], // 英文数字 → 愚者
    ['i', 'magician'], // 罗马数字 I → 魔术师（索引 1）
    ['xii', 'hanged'], // 罗马数字 XII → 倒吊人（异常映射到 hanged）
    ['21', 'world'], // 数字 → 世界
    ['twenty_one', 'world'], // 英文数字（带下划线）→ 世界
    ['twentyone', 'world'], // 英文数字（无下划线）→ 世界
    ['the_chariot', 'chariot'], // the_ 前缀 → 战车
    ['the_high_priestess', 'priestess'], // the_ 前缀 + 异常映射 → 女祭司文件名 priestess
    ['the_wheel_of_fortune', 'fortune'], // the_ 前缀 + 异常映射 → 命运之轮文件名 fortune
  ];

  it('getCardImageFilename normalizes to correct slug', () => {
    for (const [input, slug] of cases) {
      const fn = getCardImageFilename({ type: 'major', value: input } as any);
      expect(fn).toBe(`major_arcana_${slug}.png`);
    }
  });

  it('getCardImagePath resolves to existing url (not fallback)', () => {
    for (const [input, slug] of cases) {
      const url = getCardImagePath({ type: 'major', value: input } as any);
      expect(url).not.toBe(fallbackUrl);
      expect(url).toContain(`major_arcana_${slug}.png`);
    }
  });
});
