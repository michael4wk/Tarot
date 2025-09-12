import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  getAllStandardizedCardsCached,
  pickFiveFromDeck,
  selectCardById,
  interpretQuestion,
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

describe('tarotService.interpretQuestion - AI 接入与故障转移', () => {
  // 获取 headers 的工具，兼容 Headers/数组/普通对象
  function getHeader(init: RequestInit | undefined, name: string): string | undefined {
    const hs: any = init?.headers as any;
    if (!hs) return undefined;
    const lower = name.toLowerCase();
    if (typeof Headers !== 'undefined' && hs instanceof Headers) return hs.get(name) ?? undefined;
    if (Array.isArray(hs)) {
      const found = hs.find((pair: any) => String(pair?.[0] ?? '').toLowerCase() === lower);
      return found?.[1];
    }
    const key = Object.keys(hs).find((k) => k.toLowerCase() === lower);
    return key ? hs[key] : undefined;
  }

  // 统一获取 fetch 第一个参数中的 URL，无论是 string 还是 Request 实例
  function getCallUrl(arg: any): string {
    if (arg && typeof arg === 'object' && 'url' in arg) return String((arg as any).url);
    return String(arg ?? '');
  }

  // 将对象浅写入 import.meta.env 并返回回滚函数
  function patchEnv(vars: Record<string, any>) {
    const env = (import.meta as any).env || ((import.meta as any).env = {});
    const prev: Record<string, any> = {};
    for (const k of Object.keys(vars)) {
      prev[k] = env[k];
      env[k] = vars[k];
    }
    return () => {
      for (const k of Object.keys(vars)) env[k] = prev[k];
    };
  }

  // 测试工具：设置 AI 运行时覆盖开关，并返回回滚函数以恢复原状
  // 之所以在测试内使用运行时覆盖，是为屏蔽本机 .env.local 真值（如真实 API Key、禁用开关）对分支选择的影响，
  // 确保分支路径（代理/直连、Gemini/Zhipu）在不同环境下都能保持一致与可复现。
  function setAiRuntimeOverrides(overrides: { proxy?: boolean; gemini?: boolean; zhipu?: boolean; debug?: boolean } = {}) {
    // 记录当前（可能为 undefined）的旧值，用于回滚
    const prev = {
      proxy: (globalThis as any).__AI_FORCE_PROXY__,
      gemini: (globalThis as any).__AI_FORCE_GEMINI__,
      zhipu: (globalThis as any).__AI_FORCE_ZHIPU__,
      debug: (globalThis as any).__DEBUG_AI__,
    } as Record<string, any>;

    // 应用新值（仅对传入项生效）
    if (Object.prototype.hasOwnProperty.call(overrides, 'proxy')) {
      (globalThis as any).__AI_FORCE_PROXY__ = overrides.proxy;
    }
    if (Object.prototype.hasOwnProperty.call(overrides, 'gemini')) {
      (globalThis as any).__AI_FORCE_GEMINI__ = overrides.gemini;
    }
    if (Object.prototype.hasOwnProperty.call(overrides, 'zhipu')) {
      (globalThis as any).__AI_FORCE_ZHIPU__ = overrides.zhipu;
    }
    if (Object.prototype.hasOwnProperty.call(overrides, 'debug')) {
      (globalThis as any).__DEBUG_AI__ = overrides.debug;
    }

    // 提供回滚函数：若旧值为 undefined 则删除覆盖；否则恢复旧值
    return () => {
      if (prev.proxy === undefined) delete (globalThis as any).__AI_FORCE_PROXY__;
      else (globalThis as any).__AI_FORCE_PROXY__ = prev.proxy;

      if (prev.gemini === undefined) delete (globalThis as any).__AI_FORCE_GEMINI__;
      else (globalThis as any).__AI_FORCE_GEMINI__ = prev.gemini;

      if (prev.zhipu === undefined) delete (globalThis as any).__AI_FORCE_ZHIPU__;
      else (globalThis as any).__AI_FORCE_ZHIPU__ = prev.zhipu;

      if (prev.debug === undefined) delete (globalThis as any).__DEBUG_AI__;
      else (globalThis as any).__DEBUG_AI__ = prev.debug;
    };
  }

  afterEach(() => {
    // 确保每个测试用例结束后还原 fetch 与环境变量的变更
    vi.restoreAllMocks();
    
    // 统一清理运行时全局覆盖变量，避免测试间串扰
    delete (globalThis as any).__AI_FORCE_PROXY__;
    delete (globalThis as any).__AI_FORCE_GEMINI__;
    delete (globalThis as any).__AI_FORCE_ZHIPU__;
    delete (globalThis as any).__DEBUG_AI__;
  });

  it('Gemini - 代理模式（DEV + VITE_AI_DEV_PROXY=1）：走 /api/ai/gemini 且不带 Authorization', async () => {
    const rollback = patchEnv({
      DEV: true,
      VITE_ENABLE_AI_READING: 'true',
      VITE_AI_DEV_PROXY: '1',
      VITE_GEMINI_API_KEY: 'fake_key',
      VITE_GEMINI_RETRIES: '0', // 避免重试
    });

    // 模拟 Gemini 成功响应（文本为严格 JSON 字符串）
    const ok = {
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          { content: { parts: [{ text: JSON.stringify({ core: '洞察A', actions: ['a1', 'a2'], warnings: ['w1', 'w2', 'w3'] }) }] } },
        ],
      }),
    } as any;

    const fetchMock = vi.fn(async (input: any, init?: any) => {
      const url = String((input && (input.url || input)) || '');
      if (url.startsWith('/api/ai/gemini/')) {
        // 代理模式下不应携带 Authorization，且 Accept 为 application/json
        expect(getHeader(init, 'Authorization')).toBeUndefined();
        expect(getHeader(init, 'Accept')).toBe('application/json');
        return ok;
      }
      // 其余请求返回空响应，避免影响流程
      return { ok: true, status: 200, json: async () => ({}) } as any;
    });
    vi.stubGlobal('fetch', fetchMock as any);

    const res = await interpretQuestion({ question: '我该如何推进项目', cardId: 'id_x' });
    expect(res.core).toContain('洞察');
    expect(res.actions.length).toBeGreaterThanOrEqual(2);
    // 在所有调用中定位 Gemini 代理 URL
    expect(fetchMock).toHaveBeenCalled();
    const geminiProxyCall = fetchMock.mock.calls.find((c: any[]) => getCallUrl(c[0]).startsWith('/api/ai/gemini/'));
    expect(!!geminiProxyCall).toBe(true);

    rollback();
  });

  it('Gemini - 直连模式（VITE_AI_DEV_PROXY=0）：直连 Google API（URL 携带 key），不带 Authorization', async () => {
    const rollback = patchEnv({
      DEV: true, // 保持 DEV 为 true，通过代理开关控制路径
      VITE_ENABLE_AI_READING: 'true',
      VITE_AI_DEV_PROXY: '0', // 关闭代理开关
      VITE_GEMINI_API_KEY: 'fake_key',
      VITE_GEMINI_RETRIES: '0',
      VITE_USE_MOCK: 'false', // 禁用本地Mock回退，确保进入AI通道
    });

    const rollbackRt = setAiRuntimeOverrides({ proxy: false, gemini: true, zhipu: false });

    const ok = {
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          { content: { parts: [{ text: JSON.stringify({ core: '直连洞察', actions: ['x1', 'x2'], warnings: ['w1', 'w2', 'w3'] }) }] } },
        ],
      }),
    } as any;

    let seenGeminiDirect = false; // 标志：是否命中直连 URL
    const seenUrls: string[] = [];
    const fetchMock = vi.fn(async (input: any, init?: any) => {
      const url = String((input && (input.url || input)) || '');
      seenUrls.push(url);
      // 以是否携带 key= 查询参数来判定直连（代理模式不会在浏览器侧携带 key）
      if (url.includes('key=')) {
        seenGeminiDirect = true; // 命中直连
        expect(getHeader(init, 'Authorization')).toBeUndefined();
        return ok;
      }
      return { ok: true, status: 200, json: async () => ({}) } as any;
    });
    vi.stubGlobal('fetch', fetchMock as any);

    const res = await interpretQuestion({ question: '直连校验', cardId: 'id_y' });
    expect(res.core).toContain('直连');
    expect(fetchMock).toHaveBeenCalled();

    // 诊断：列出所有 fetch 调用的 URL，辅助定位未命中直连的原因
    // 使用 console.info，确保在 Vitest 输出中可见
    // 使用 console.info，确保在 Vitest 输出中可见
    // eslint-disable-next-line no-console
    console.info('[TEST][Gemini Direct] fetch URLs seen:', seenUrls);
    // 同时打印由业务代码捕获的 URL（构造时刻），用于与 fetch 入参对照
    // eslint-disable-next-line no-console
    console.info('[TEST][Gemini Direct] captured URLs:', (globalThis as any).__CAPTURE_AI_URLS__);

    const captured: string[] = (globalThis as any).__CAPTURE_AI_URLS__ || [];

    // 断言：至少一次 URL 携带 key=（代理模式不会在浏览器侧携带 key）
    expect(seenUrls.some((u) => u.includes('key=')) ||
           captured.some((u) => u.includes('key='))).toBe(true);

    // 断言：确实发生了直连调用（基于 fetchMock 内部匹配）
    expect(seenGeminiDirect).toBe(true);

    // 清理覆盖与环境
    rollbackRt();
    delete (globalThis as any).__CAPTURE_AI_URLS__;
    rollback();
  });

  it('Zhipu - 代理模式：走 /api/ai/zhipu 且不带 Authorization（由代理注入）', async () => {
    const rollback = patchEnv({
      DEV: true,
      VITE_ENABLE_AI_READING: 'true',
      VITE_AI_DEV_PROXY: '1',
      VITE_GEMINI_API_KEY: '', // 使 Gemini 通道直接抛错从而进入 Zhipu
      VITE_ZHIPU_API_KEY: 'fake_key',
      VITE_ZHIPU_RETRIES: '0',
      VITE_DISABLE_ZHIPU: '0', // 显式开启 Zhipu，以避免被本地 .env 禁用
    });

    const rollbackRt = setAiRuntimeOverrides({ proxy: true, zhipu: true });

    const ok = {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ core: '智谱洞察', actions: ['z1', 'z2'], warnings: ['w1', 'w2', 'w3'] }) } }],
      }),
    } as any;

    const fetchMock = vi.fn(async (input: any, init?: any) => {
      const url = String((input && (input.url || input)) || '');
      if (url.startsWith('/api/ai/gemini/')) {
        // Gemini 会先抛错（因为缺 key），simulate 500 让其快速失败
        return { ok: false, status: 500, json: async () => ({}) } as any;
      }
      if (url.startsWith('/api/ai/zhipu')) {
        expect(getHeader(init, 'Authorization')).toBeUndefined();
        expect(getHeader(init, 'Accept')).toBe('application/json');
        return ok;
      }
      return { ok: true, status: 200, json: async () => ({}) } as any;
    });
    vi.stubGlobal('fetch', fetchMock as any);

    const res = await interpretQuestion({ question: '代理校验', cardId: 'id_z' });
    expect(res.core).toContain('智谱');

    // 验证：Zhipu 代理调用已发生
    expect(fetchMock).toHaveBeenCalled();
    const urls = fetchMock.mock.calls.map((c: any[]) => getCallUrl(c[0]));
    expect(urls.some((u: string) => u.startsWith('/api/ai/zhipu'))).toBe(true);

    rollbackRt();
    rollback();
  });

  it('Zhipu - 直连模式：直连 open.bigmodel 并带 Authorization: Bearer <key>', async () => {
    const rollback = patchEnv({
      DEV: false, // 直连：避免代理分支
      VITE_ENABLE_AI_READING: 'true',
      VITE_AI_DEV_PROXY: '0',
      VITE_GEMINI_API_KEY: '', // 确保进入 Zhipu 分支
      VITE_ZHIPU_API_KEY: 'fake_key',
      VITE_ZHIPU_RETRIES: '0',
      VITE_DISABLE_ZHIPU: '0', // 显式开启 Zhipu，避免被 .env.local 覆盖
    });

    const rollbackRt = setAiRuntimeOverrides({ proxy: false, gemini: false, zhipu: true });

    const ok = {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ core: '直连智谱', actions: ['c1', 'c2'], warnings: ['w1', 'w2', 'w3'] }) } }],
      }),
    } as any;

    let seenZhipuDirect = false; // 标志：是否命中直连 URL
    const allCalls: Array<{ url: string; auth?: string }> = []; // 调试：记录所有调用
    
    const fetchMock = vi.fn(async (input: any, init?: any) => {
      const url = String((input && (input.url || input)) || '');
      const auth = getHeader(init, 'Authorization');
      
      // 记录所有调用用于调试
      allCalls.push({ url, auth });
      // eslint-disable-next-line no-console
      console.log('[DEBUG] fetchMock called with:', { url, auth });
      
      // 直连判定：命中 open.bigmodel.cn 且 Authorization 为 Bearer 开头
      if (url.includes('open.bigmodel.cn') && typeof auth === 'string' && auth.startsWith('Bearer ')) {
        seenZhipuDirect = true; // 命中直连
        // eslint-disable-next-line no-console
        console.log('[DEBUG] Direct Zhipu detected!');
        return ok;
      }
      return { ok: true, status: 200, json: async () => ({}) } as any;
    });
    vi.stubGlobal('fetch', fetchMock as any);

    const res = await interpretQuestion({ question: '直连智谱校验', cardId: 'id_w' });
    expect(res.core).toContain('直连智谱');
    expect(fetchMock).toHaveBeenCalled();

    // 调试输出
    // eslint-disable-next-line no-console
    console.log('[DEBUG] All fetch calls:', allCalls);
    // eslint-disable-next-line no-console
    console.log('[DEBUG] seenZhipuDirect:', seenZhipuDirect);

    // 断言：确实发生了直连调用
    expect(seenZhipuDirect).toBe(true);

    // 清理覆盖与环境
    rollbackRt();
    rollback();
  });

  it('故障转移：Gemini 失败（500）→ Zhipu 成功返回并被规范化', async () => {
    const rollback = patchEnv({
      DEV: true,
      VITE_ENABLE_AI_READING: 'true',
      VITE_AI_DEV_PROXY: '1',
      VITE_GEMINI_API_KEY: 'fake_g',
      VITE_ZHIPU_API_KEY: 'fake_z',
      VITE_GEMINI_RETRIES: '0',
      VITE_ZHIPU_RETRIES: '0',
      VITE_AI_CHAIN_DEADLINE_MS: '8000',
      VITE_DISABLE_ZHIPU: '0', // 显式开启 Zhipu，确保故障转移时能调用
    });

    const rollbackRt = setAiRuntimeOverrides({ proxy: true, zhipu: true });

    const okZ = {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ core: '兜底智谱', actions: ['s1', 's2'], warnings: ['w1', 'w2', 'w3'] }) } }],
      }),
    } as any;

    const fetchMock = vi.fn(async (input: any, init?: any) => {
      const url = String((input && (input.url || input)) || '');
      if (url.startsWith('/api/ai/gemini/')) {
        return { ok: false, status: 500, json: async () => ({}) } as any;
      }
      if (url.startsWith('/api/ai/zhipu')) return okZ;
      return { ok: true, status: 200, json: async () => ({}) } as any;
    });
    vi.stubGlobal('fetch', fetchMock as any);

    const res = await interpretQuestion({ question: '发生错误后兜底', cardId: 'id_v' });
    expect(res.core).toContain('兜底');

    // 验证调用顺序：先 Gemini 后 Zhipu
    const urls = fetchMock.mock.calls.map((c: any[]) => getCallUrl(c[0]));
    const gemIdx = urls.findIndex((u: string) => u.startsWith('/api/ai/gemini/'));
    const zIdx = urls.findIndex((u: string) => u.startsWith('/api/ai/zhipu'));
    expect(gemIdx).toBeGreaterThanOrEqual(0);
    expect(zIdx).toBeGreaterThan(gemIdx);

    rollbackRt();
    rollback();
  });
});
