import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getAllStandardizedCardsCached,
  pickFiveFromDeck,
  selectCardById,
  type StandardCard,
} from './tarotService';

// 说明：
// 本测试文件覆盖 tarotService 的健壮性与核心流程：
// 1) 成功路径/失败回退（本地 78 张）
// 2) 超时/网络错误/HTTP 5xx/4xx 的分类与重试次数验证
// 3) 缓存命中（版本匹配且非强制刷新时不再触发 fetch）
// 4) pickFiveFromDeck 与 selectCardById 的基本正确性
//
// 注意：
// - 我们通过 mock 全局 fetch 来控制各种响应场景；
// - 对于超时场景，直接让 mock fetch 抛出 AbortError（name = 'AbortError'），
//   以验证 classifyError 与重试逻辑；
// - 日志仅在 DEV 输出，测试中静默 console.warn 以减少噪音；
// - 每个用例前清理 localStorage，避免缓存相互影响。

const DECK_CACHE_KEY = 'tarot2:deck:std:v1';

function createAbortError() {
  const err = new Error('Aborted') as any;
  err.name = 'AbortError';
  return err;
}

function countLocalStorageItems() {
  let count = 0;
  for (let i = 0; i < localStorage.length; i++) count++;
  return count;
}

beforeEach(() => {
  // 清理缓存，重置 mock
  localStorage.clear();
  vi.restoreAllMocks();
  // 静默 DEV 日志
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('tarotService.getAllStandardizedCardsCached - 回退与重试', () => {
  it('网络错误：应进行重试，最终回退到本地 78 张，并写入缓存', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch' as any)
      .mockRejectedValue(new Error('Network fail'));

    const res = await getAllStandardizedCardsCached({ retries: 2 });
    expect(Array.isArray(res)).toBe(true);
    expect(res.length).toBe(78);

    // 重试 2 次 + 首次 = 3 次调用
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // 已写入缓存
    const raw = localStorage.getItem(DECK_CACHE_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw as string);
    expect(parsed.cards.length).toBe(78);
  });

  it('HTTP 500：可重试，应按次数重试后回退', async () => {
    const resp500 = { ok: false, status: 500, json: vi.fn() } as any;
    const fetchMock500 = vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue(resp500);

    const res500 = await getAllStandardizedCardsCached({ retries: 2 });
    expect(res500.length).toBe(78);
    expect(fetchMock500).toHaveBeenCalledTimes(3);
  });

  it('HTTP 404：不可重试，应只请求一次后回退（强制刷新以跳过缓存）', async () => {
    const resp404 = { ok: false, status: 404, json: vi.fn() } as any;
    const fetchMock404 = vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue(resp404);

    const res404 = await getAllStandardizedCardsCached({ retries: 5, forceRefresh: true });
    expect(res404.length).toBe(78);
    expect(fetchMock404).toHaveBeenCalledTimes(1);
  });

  it('超时（AbortError）：视为可重试，按次数重试后回退', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch' as any).mockRejectedValue(createAbortError());

    const res = await getAllStandardizedCardsCached({ retries: 1 });
    expect(res.length).toBe(78);
    // 首次 + 重试 = 2 次
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('tarotService.getAllStandardizedCardsCached - 缓存命中', () => {
  it('首次失败触发回退并写入缓存；二次调用命中缓存（版本匹配且非强制刷新），不再触发 fetch', async () => {
    // 第一次：触发回退以便写入缓存
    vi.spyOn(globalThis, 'fetch' as any).mockRejectedValue(new Error('Network down'));
    const first = await getAllStandardizedCardsCached({ retries: 0 });
    expect(first.length).toBe(78);

    // 验证缓存确实写入
    const cachedBefore = localStorage.getItem(DECK_CACHE_KEY);
    expect(cachedBefore).toBeTruthy();

    // 第二次：不应再触发 fetch（缓存命中）
    vi.restoreAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, 'fetch' as any);
    const second = await getAllStandardizedCardsCached({
      /* 使用默认 forceRefresh 逻辑 */
    });
    expect(second.length).toBe(78);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('tarotService 辅助函数', () => {
  it('pickFiveFromDeck：在有足够卡牌时返回 5 张且不重复，并遵循给定 rng', () => {
    const deck: StandardCard[] = Array.from({ length: 10 }).map((_, i) => ({
      id: `id_${i}`,
      uniqueId: `u_${i}`,
      name: `n_${i}`,
      name_short: `s_${i}`,
      type: 'major',
      suit: null,
      value: String(i),
      meaning_up: '',
      meaning_rev: '',
      desc: '',
      indexPosition: i,
      isReversed: false,
      frontSrc: `/fake/${i}.svg`,
    }));

    // 设计一个确定性的 rng：依次返回 0, 0.1, 0.2, 0.3, 0.4 → floor 后对应索引 0..4
    const seq = [0, 0.1, 0.2, 0.3, 0.4];
    let p = 0;
    const rng = () => {
      const v = seq[p % seq.length];
      p += 1;
      return v;
    };

    const five = pickFiveFromDeck(deck, rng);
    expect(five).toHaveLength(5);
    expect(new Set(five.map((c) => c.id)).size).toBe(5);
    expect(five.map((c) => c.id)).toEqual(['id_0', 'id_1', 'id_2', 'id_3', 'id_4']);
  });

  it('selectCardById：能按 id 精确选中，找不到返回 null', () => {
    const cards: StandardCard[] = [
      {
        id: 'a',
        uniqueId: 'a',
        name: 'A',
        name_short: 'A',
        type: 'major',
        suit: null,
        value: '0',
        meaning_up: '',
        meaning_rev: '',
        desc: '',
        indexPosition: 0,
        isReversed: false,
        frontSrc: '/a.svg',
      },
      {
        id: 'b',
        uniqueId: 'b',
        name: 'B',
        name_short: 'B',
        type: 'major',
        suit: null,
        value: '1',
        meaning_up: '',
        meaning_rev: '',
        desc: '',
        indexPosition: 1,
        isReversed: false,
        frontSrc: '/b.svg',
      },
    ];
    expect(selectCardById(cards, 'a')?.id).toBe('a');
    expect(selectCardById(cards, 'x')).toBeNull();
  });
});
