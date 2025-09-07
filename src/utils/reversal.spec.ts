import { describe, it, expect } from 'vitest';
import { withReversal, DEFAULT_REVERSED_PROB } from './reversal';

// 简单可复现的种子随机函数（mulberry32）
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('withReversal', () => {
  const sample = Array.from({ length: 10000 }, (_, i) => ({ id: i }));

  it('p = 0 应全部为正位', () => {
    const out = withReversal(sample, { reversedProbability: 0, random: mulberry32(1) });
    expect(out.every((x) => x.isReversed === false)).toBe(true);
  });

  it('p = 1 应全部为逆位', () => {
    const out = withReversal(sample, { reversedProbability: 1, random: mulberry32(1) });
    expect(out.every((x) => x.isReversed === true)).toBe(true);
  });

  it('p = 0.3 统计应接近 30%（±2% 容差）', () => {
    const out = withReversal(sample, { reversedProbability: 0.3, random: mulberry32(42) });
    const ratio = out.filter((x) => x.isReversed).length / out.length;
    expect(ratio).toBeGreaterThanOrEqual(0.28);
    expect(ratio).toBeLessThanOrEqual(0.32);
  });

  it('默认概率常量为 0.3', () => {
    expect(DEFAULT_REVERSED_PROB).toBe(0.3);
  });

  it('不可变性：不修改原数组与原对象', () => {
    const original = [{ id: 1 }, { id: 2 }];
    const snapshot = JSON.stringify(original);
    const out = withReversal(original, { random: mulberry32(7) });

    // 原数组保持不变
    expect(JSON.stringify(original)).toBe(snapshot);

    // 返回新对象，不与原对象引用相同
    out.forEach((item, idx) => {
      expect(item).not.toBe(original[idx] as any);
      expect(typeof item.isReversed).toBe('boolean');
    });
  });

  it('preserveExisting=true 时保留已存在的 isReversed', () => {
    const input = [
      { id: 1, isReversed: true },
      { id: 2, isReversed: false },
    ];
    const out = withReversal(input, {
      reversedProbability: 0.0,
      random: mulberry32(1),
      preserveExisting: true,
    });
    expect(out[0].isReversed).toBe(true);
    expect(out[1].isReversed).toBe(false);
  });

  it('preserveExisting=false 时可覆盖已存在的 isReversed', () => {
    const input = [
      { id: 1, isReversed: true },
      { id: 2, isReversed: false },
    ];
    const out = withReversal(input, {
      reversedProbability: 1.0,
      random: mulberry32(1),
      preserveExisting: false,
    });
    expect(out[0].isReversed).toBe(true);
    expect(out[1].isReversed).toBe(true);
  });
});
