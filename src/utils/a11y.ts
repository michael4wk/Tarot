/**
 * A11y 辅助工具
 * - isActionKey：判断是否为触发组件主操作的键（Space/Enter）
 * - nextIndexByArrow：根据箭头键与列数计算下一个线性索引（简化版 roving tabindex）
 */
export function isActionKey(e: KeyboardEvent): boolean {
  const k = e.key;
  return k === 'Enter' || k === ' ' || k === 'Spacebar';
}

export type ArrowKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';

export function isArrowKey(k: string): k is ArrowKey {
  return k === 'ArrowUp' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowRight';
}

/**
 * 计算网格内基于箭头键的下一个索引。
 * - linearIndex: 当前线性索引（0-based）
 * - columns: 当前列数
 * - total: 总项目数
 * - key: 方向键
 * 策略：
 * - 上/下：按列数跳跃；越界则保持在原位
 * - 左/右：在同一行内移动；越界则保持在原位
 */
export function nextIndexByArrow(
  linearIndex: number,
  columns: number,
  total: number,
  key: ArrowKey,
): number {
  const col = linearIndex % columns;
  let next = linearIndex;
  switch (key) {
    case 'ArrowUp': {
      const target = linearIndex - columns;
      if (target >= 0) next = target;
      break;
    }
    case 'ArrowDown': {
      const target = linearIndex + columns;
      if (target < total) next = target;
      break;
    }
    case 'ArrowLeft': {
      if (col > 0) next = linearIndex - 1;
      break;
    }
    case 'ArrowRight': {
      if (col < columns - 1 && linearIndex + 1 < total) next = linearIndex + 1;
      break;
    }
  }
  return next;
}
