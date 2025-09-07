// 正逆位随机赋值工具（数据层纯函数）
// 目标：
// - 按给定概率为输入数组中的每个对象生成 isReversed:boolean 字段
// - 不修改原始数组与原始对象（不可变性/纯函数）
// - 支持注入随机源（默认 Math.random），便于测试的可复现性（种子随机）
// - 默认逆位概率为 0.3（可配置），超界输入会被钳制到 [0,1]
// - 当对象已存在 isReversed 字段时，默认保留（可通过 preserveExisting 控制）

export interface WithReversalOptions {
  /** 逆位概率，默认 0.3，有效范围 [0,1] */
  reversedProbability?: number;
  /** 随机源，默认 Math.random；测试时可注入种子随机函数以复现结果 */
  random?: () => number;
  /** 当对象已含 isReversed 字段时是否保留（不覆盖），默认 true */
  preserveExisting?: boolean;
}

/** 默认逆位概率（产品规划：30% 概率逆位） */
export const DEFAULT_REVERSED_PROB = 0.3;

/** 将数值钳制到 [min,max] 区间 */
function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/** 断言数值合法 */
function assertNumber(name: string, value: unknown): asserts value is number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new TypeError(`${name} must be a valid number`);
  }
}

/**
 * 为数组中的每个元素生成 isReversed 字段。
 * 注意：返回新数组与新对象，输入保持不变。
 */
export function withReversal<T extends Record<string, any>>(
  items: ReadonlyArray<T>,
  options: WithReversalOptions = {},
): Array<T & { isReversed: boolean }> {
  const {
    reversedProbability = DEFAULT_REVERSED_PROB,
    random = Math.random,
    preserveExisting = true,
  } = options;

  assertNumber('reversedProbability', reversedProbability);
  const prob = clamp(reversedProbability, 0, 1);

  if (import.meta.env.DEV) {
    // 在开发环境中，如果传入概率越界则给出一次性警告（但已做钳制，避免影响行为）
    if (reversedProbability !== prob) {
      // eslint-disable-next-line no-console
      console.warn(
        `[withReversal] reversedProbability out of range (${reversedProbability}), clamped to ${prob}`,
      );
    }
  }

  // 纯函数：不修改原数组及其中对象
  return items.map((item) => {
    const keepExisting = preserveExisting && typeof (item as any).isReversed === 'boolean';
    const isReversed = keepExisting ? Boolean((item as any).isReversed) : random() < prob;
    // 返回浅拷贝的新对象，附加/保留 isReversed 字段
    return { ...(item as object), isReversed } as T & { isReversed: boolean };
  });
}
