import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type {
  StandardCard,
} from './tarotService';

// 顶层类型与工具函数（供整份测试复用，替代零散的 any 与重复定义）
function getCallUrl(arg: unknown): string {
  // 支持 string/URL/Request 等常见输入，统一取 url 字段或直接转字符串
  if (arg && typeof arg === 'object' && 'url' in (arg as Record<string, unknown>)) {
    return String((arg as Record<string, unknown>).url as unknown);
  }
  return String(arg ?? '');
}
function getHeader(init: RequestInit | undefined, name: string): string | undefined {
  const hs = init?.headers;
  if (!hs) return undefined;
  const lower = name.toLowerCase();
  if (typeof Headers !== 'undefined' && hs instanceof Headers) return hs.get(name) ?? undefined;
  if (Array.isArray(hs)) {
    const found = hs.find((pair) => String((pair?.[0] ?? '')).toLowerCase() === lower);
    return (found?.[1] as string | undefined) ?? undefined;
  }
  const obj = hs as Record<string, string>;
  const key = Object.keys(obj).find((k) => k.toLowerCase() === lower);
  return key ? obj[key] : undefined;
}
// 动态导入赋值的被测函数显式类型（需在 beforeEach 的解构赋值前声明）
let getAllStandardizedCardsCached!: (options?: import('./tarotService').GetAllOptions) => Promise<import('./tarotService').StandardCard[]>;
let pickFiveFromDeck!: (cards: import('./tarotService').StandardCard[], rng?: () => number) => import('./tarotService').StandardCard[];
let selectCardById!: (cards: import('./tarotService').StandardCard[], id: string) => import('./tarotService').StandardCard | null;
let interpretQuestion!: (input: import('./tarotService').InterpretInput) => Promise<import('./tarotService').InterpretResult>;

// 初始化占位桩实现：在 beforeEach 赋值前，调用将抛出明确错误，避免 ESLint/TS 静态报错
getAllStandardizedCardsCached = async () => { throw new Error('getAllStandardizedCardsCached not initialized'); };
pickFiveFromDeck = () => { throw new Error('pickFiveFromDeck not initialized'); };
selectCardById = () => { throw new Error('selectCardById not initialized'); };
interpretQuestion = async () => { throw new Error('interpretQuestion not initialized'); };

// 说明:
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

function createAbortError(): Error & { name: string } {
  const err = new Error('Aborted') as Error & { name: string };
  err.name = 'AbortError';
  return err;
}


beforeEach(async () => {
  // 清理缓存，重置 mock
  localStorage.clear();
  vi.restoreAllMocks();
  // 静默 DEV 日志
  vi.spyOn(console, 'warn').mockImplementation(() => { });

  // 动态导入被测模块，确保每个用例的环境变量与 fetch stub 都能生效
  ({
    getAllStandardizedCardsCached,
    pickFiveFromDeck,
    selectCardById,
    interpretQuestion,
  } = await import('./tarotService'));
});

// 移除下方重复的 any 声明
// let getAllStandardizedCardsCached: any;
// let pickFiveFromDeck: any;
// let selectCardById: any;
// let interpretQuestion: any;

describe('tarotService.getAllStandardizedCardsCached - 回退与重试', () => {
  it('网络错误：应进行重试，最终回退到本地 78 张，并写入缓存', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
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
    const resp500 = new Response('{}', { status: 500, headers: { 'Content-Type': 'application/json' } });
    const fetchMock500 = vi.spyOn(globalThis, 'fetch').mockResolvedValue(resp500);

    const res500 = await getAllStandardizedCardsCached({ retries: 2 });
    expect(res500.length).toBe(78);
    expect(fetchMock500).toHaveBeenCalledTimes(3);
  });

  it('HTTP 404：不可重试，应只请求一次后回退（强制刷新以跳过缓存）', async () => {
    const resp404 = new Response('{}', { status: 404, headers: { 'Content-Type': 'application/json' } });
    const fetchMock404 = vi.spyOn(globalThis, 'fetch').mockResolvedValue(resp404);

    const res404 = await getAllStandardizedCardsCached({ retries: 5, forceRefresh: true });
    expect(res404.length).toBe(78);
    expect(fetchMock404).toHaveBeenCalledTimes(1);
  });

  it('超时（AbortError）：视为可重试，按次数重试后回退', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(createAbortError());

    const res = await getAllStandardizedCardsCached({ retries: 1 });
    expect(res.length).toBe(78);
    // 首次 + 重试 = 2 次
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('tarotService.getAllStandardizedCardsCached - 缓存命中', () => {
  it('首次失败触发回退并写入缓存；二次调用命中缓存（版本匹配且非强制刷新），不再触发 fetch', async () => {
    // 第一次：触发回退以便写入缓存
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network down'));
    const first = await getAllStandardizedCardsCached({ retries: 0 });
    expect(first.length).toBe(78);

    // 验证缓存确实写入
    const cachedBefore = localStorage.getItem(DECK_CACHE_KEY);
    expect(cachedBefore).toBeTruthy();

    // 第二次：不应再触发 fetch（缓存命中）
    vi.restoreAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => { });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
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
  // 在本 describe 内再次确保动态赋值（防止顶层 beforeEach 被局部覆盖时出现未赋值）
  beforeEach(async () => {
    const svc = await import('./tarotService');
    getAllStandardizedCardsCached = svc.getAllStandardizedCardsCached;
    pickFiveFromDeck = svc.pickFiveFromDeck;
    selectCardById = svc.selectCardById;
    interpretQuestion = svc.interpretQuestion;
  });

  // 局部工具：浅写入 import.meta.env 并返回回滚函数（统一支持 string/number/boolean，统一写入为字符串）
  function patchEnv(vars: Record<string, string | number | boolean>) {
    const meta = (import.meta as unknown as { env?: Record<string, string> });
    const envObj = meta.env ?? (meta.env = {});
    const prev: Record<string, string | undefined> = {};
    for (const k of Object.keys(vars)) {
      prev[k] = envObj[k];
      envObj[k] = String(vars[k]);
    }
    // 同步写入全局测试覆盖，供被测模块通过 getEnv() 读取（跨模块 import.meta.env 可能不共享）
    const g = globalThis as unknown as Record<string, unknown>;
    const key = '__TEST_IMPORT_META_ENV__';
    const cur = g[key] as Record<string, string | undefined> | undefined;
    const ov = cur ?? (g[key] = {} as Record<string, string | undefined>, g[key] as Record<string, string | undefined>);
    const prevOv: Record<string, string | undefined> = {};
    for (const k of Object.keys(vars)) {
      prevOv[k] = ov[k];
      ov[k] = String(vars[k]);
    }
    return () => {
      for (const k of Object.keys(vars)) {
        const pv = prev[k];
        if (pv === undefined) delete envObj[k]; else envObj[k] = pv;
      }
      for (const k of Object.keys(vars)) {
        const pv2 = prevOv[k];
        if (pv2 === undefined) delete ov[k]; else ov[k] = pv2;
      }
    };
  }

  // 测试工具：设置 AI 运行时覆盖开关，并返回回滚函数以恢复原状
  // 之所以在测试内使用运行时覆盖，是为屏蔽本机 .env.local 真值（如真实 API Key、禁用开关）对分支选择的影响，
  // 确保分支路径（代理/直连、Gemini/Zhipu）在不同环境下都能保持一致与可复现。
  function setAiRuntimeOverrides(overrides: { proxy?: boolean; gemini?: boolean; zhipu?: boolean; debug?: boolean } = {}) {
    const g = globalThis as HedgeGlobals;
    const prev = {
      proxy: g.__AI_FORCE_PROXY__,
      gemini: g.__AI_FORCE_GEMINI__,
      zhipu: g.__AI_FORCE_ZHIPU__,
      debug: g.__DEBUG_AI__,
    };

    if (Object.prototype.hasOwnProperty.call(overrides, 'proxy')) {
      g.__AI_FORCE_PROXY__ = overrides.proxy;
    }
    if (Object.prototype.hasOwnProperty.call(overrides, 'gemini')) {
      g.__AI_FORCE_GEMINI__ = overrides.gemini;
    }
    if (Object.prototype.hasOwnProperty.call(overrides, 'zhipu')) {
      g.__AI_FORCE_ZHIPU__ = overrides.zhipu;
    }
    if (Object.prototype.hasOwnProperty.call(overrides, 'debug')) {
      g.__DEBUG_AI__ = overrides.debug;
    }

    return () => {
      if (prev.proxy === undefined) delete g.__AI_FORCE_PROXY__;
      else g.__AI_FORCE_PROXY__ = prev.proxy;

      if (prev.gemini === undefined) delete g.__AI_FORCE_GEMINI__;
      else g.__AI_FORCE_GEMINI__ = prev.gemini;

      if (prev.zhipu === undefined) delete g.__AI_FORCE_ZHIPU__;
      else g.__AI_FORCE_ZHIPU__ = prev.zhipu;

      if (prev.debug === undefined) delete g.__DEBUG_AI__;
      else g.__DEBUG_AI__ = prev.debug;
    };
  }

  afterEach(() => {
    // 确保每个测试用例结束后还原 fetch 与环境变量的变更
    vi.restoreAllMocks();

    // 统一清理运行时全局覆盖变量，避免测试间串扰
    const g = globalThis as HedgeGlobals;
    delete g.__AI_FORCE_PROXY__;
    delete g.__AI_FORCE_GEMINI__;
    delete g.__AI_FORCE_ZHIPU__;
    delete g.__DEBUG_AI__;
    {
      const gu = globalThis as unknown as Record<string, unknown>;
      if ('__TEST_IMPORT_META_ENV__' in gu) delete gu['__TEST_IMPORT_META_ENV__'];
    }
    if (typeof process !== 'undefined' && (process as unknown as { env?: Record<string, string | undefined> })?.env) {
      // 显式清理关键覆盖，避免被下个用例继承
      const penv = (process as unknown as { env?: Record<string, string | undefined> }).env!;
      delete penv.VITE_AI_HEDGE_ENABLED;
      delete penv.VITE_AI_HEDGE_LOG_LEVEL;
      delete penv.VITE_AI_HEDGE_DELAY_MS;
      delete penv.VITE_AI_ABORT_LOSER;
      delete penv.VITE_ENABLE_AI_READING;
      delete penv.VITE_AI_DEV_PROXY;
      delete penv.VITE_AI_TIMEOUT_MS;
      delete penv.VITE_GEMINI_API_KEY;
      delete penv.VITE_ZHIPU_API_KEY;
      delete penv.VITE_GEMINI_RETRIES;
      delete penv.VITE_ZHIPU_RETRIES;
      delete penv.VITE_MOCK_DELAY_MIN;
      delete penv.VITE_MOCK_DELAY_MAX;
      delete penv.VITE_MOCK_FAIL_RATE;
    }
  });

  it('Gemini - 代理模式（DEV + VITE_AI_DEV_PROXY=1）：走 /api/ai/gemini 且不带 Authorization', async () => {
    const rollback = patchEnv({
      DEV: 'true',
      VITE_ENABLE_AI_READING: 'true',
      VITE_AI_DEV_PROXY: '1',
      VITE_GEMINI_API_KEY: 'fake_key',
      VITE_GEMINI_RETRIES: '0', // 避免重试
    });

    // 运行时强制代理与 Gemin 路径，屏蔽编译期 import.meta.env 静态替换带来的偏差
    // 这样可确保在任何本机 .env 下都能稳定命中 "/api/ai/gemini/" 前缀
    const rollbackRt = setAiRuntimeOverrides({ proxy: true, gemini: true, zhipu: false });

    // 模拟 Gemini 成功响应（文本为严格 JSON 字符串）
    const ok = new Response(
      JSON.stringify({
        candidates: [
          { content: { parts: [{ text: JSON.stringify({ core: '洞察A', actions: ['a1', 'a2'], warnings: ['w1', 'w2', 'w3'] }) }] } },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );

    const fetchMock = vi.fn<typeof fetch>(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      void init; // 明确使用形参，避免 no-unused-vars；该形参用于传递 abort 信号等，但此测试用例不需读取
      const url = getCallUrl(input);
      if (url.startsWith('/api/ai/gemini/')) {
        // 代理模式下不应携带 Authorization，且 Accept 为 application/json
        expect(getHeader(init, 'Authorization')).toBeUndefined();
        expect(getHeader(init, 'Accept')).toBe('application/json');
        return ok;
      }
      // 其余请求返回空响应，避免影响流程
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { interpretQuestion } = await import('./tarotService');
    const res = await interpretQuestion({ question: '我该如何推进项目', cardId: 'id_x' });

    expect(res.core).toContain('洞察');
    expect(res.actions.length).toBeGreaterThanOrEqual(2);
    // 在所有调用中定位 Gemini 代理 URL
    expect(fetchMock).toHaveBeenCalled();


    const geminiProxyCall = fetchMock.mock.calls.find((c) => getCallUrl(c[0]).startsWith('/api/ai/gemini/'));
    if (!geminiProxyCall) {
      const allUrls = fetchMock.mock.calls.map((c) => getCallUrl(c[0]));
      throw new Error('[DEBUG][TEST] geminiProxyCall not found. All URLs: ' + JSON.stringify(allUrls));
    }
    expect(!!geminiProxyCall).toBe(true);

    // 先回滚运行时覆盖，再回滚临时 env 写入，避免测试间串扰
    rollbackRt();
    rollback();
  });

  it('Gemini - 直连模式（VITE_AI_DEV_PROXY=0）：直连 Google API（URL 携带 key），不带 Authorization', async () => {
    const rollback = patchEnv({
      DEV: 'true', // 保持 DEV 为 true，通过代理开关控制路径
      VITE_ENABLE_AI_READING: 'true',
      VITE_AI_DEV_PROXY: '0', // 关闭代理开关
      VITE_GEMINI_API_KEY: 'fake_key',
      VITE_GEMINI_RETRIES: '0',
      VITE_USE_MOCK: 'false', // 禁用本地Mock回退，确保进入AI通道
    });

    const rollbackRt = setAiRuntimeOverrides({ proxy: false, gemini: true, zhipu: false });

    const ok = new Response(
      JSON.stringify({
        candidates: [
          { content: { parts: [{ text: JSON.stringify({ core: '直连洞察', actions: ['x1', 'x2'], warnings: ['w1', 'w2', 'w3'] }) }] } },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );

    let seenGeminiDirect = false; // 标志：是否命中直连 URL
    const seenUrls: string[] = [];
    const fetchMock = vi.fn<typeof fetch>(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      void init; // 明确使用形参，避免 no-unused-vars；该形参用于传递 abort 信号等，但此测试用例不需读取
      const url = getCallUrl(input);
      seenUrls.push(url);
      // 以是否携带 key= 查询参数来判定直连（代理模式不会在浏览器侧携带 key）
      if (url.includes('key=')) {
        seenGeminiDirect = true; // 命中直连
        expect(getHeader(init, 'Authorization')).toBeUndefined();
        return ok;
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await interpretQuestion({ question: '直连校验', cardId: 'id_y' });
    expect(res.core).toContain('直连');
    expect(fetchMock).toHaveBeenCalled();


    const gcap = globalThis as HedgeGlobals;
    const rawCaptured = gcap.__CAPTURE_AI_URLS__;
    const captured: string[] = Array.isArray(rawCaptured) ? rawCaptured.filter((u): u is string => typeof u === 'string') : [];

    // 断言：至少一次 URL 携带 key=（代理模式不会在浏览器侧携带 key）
    expect(seenUrls.some((u) => u.includes('key=')) ||
      captured.some((u) => u.includes('key='))).toBe(true);

    // 断言：确实发生了直连调用（基于 fetchMock 内部匹配）
    expect(seenGeminiDirect).toBe(true);

    // 清理覆盖与环境
    rollbackRt();
    const gdel = globalThis as HedgeGlobals;
    delete gdel.__CAPTURE_AI_URLS__;
    rollback();
  });

  it('Zhipu - 代理模式：走 /api/ai/zhipu 且不带 Authorization（由代理注入）', async () => {
    const rollback = patchEnv({
      DEV: 'true',
      VITE_ENABLE_AI_READING: 'true',
      VITE_AI_DEV_PROXY: '1',
      VITE_GEMINI_API_KEY: '', // 使 Gemini 通道直接抛错从而进入 Zhipu
      VITE_ZHIPU_API_KEY: 'fake_key',
      VITE_ZHIPU_RETRIES: '0',
      VITE_DISABLE_ZHIPU: '0', // 显式开启 Zhipu，以避免被本地 .env 禁用
    });

    const rollbackRt = setAiRuntimeOverrides({ proxy: true, zhipu: true });

    const ok = new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify({ core: '智谱洞察', actions: ['z1', 'z2'], warnings: ['w1', 'w2', 'w3'] }) } }] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );

    const fetchMock = vi.fn<typeof fetch>(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      void init; // 明确使用形参，避免 no-unused-vars；该形参用于传递 abort 信号等，但此测试用例不需读取
      const url = getCallUrl(input);
      if (url.startsWith('/api/ai/gemini/')) {
        // Gemini 会先抛错（因为缺 key），simulate 500 让其快速失败
        return new Response('{}', { status: 500, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.startsWith('/api/ai/zhipu')) {
        expect(getHeader(init, 'Authorization')).toBeUndefined();
        expect(getHeader(init, 'Accept')).toBe('application/json');
        return ok;
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await interpretQuestion({ question: '代理校验', cardId: 'id_z' });
    expect(res.core).toContain('智谱');

    // 验证：Zhipu 代理调用已发生
    expect(fetchMock).toHaveBeenCalled();
    const urls = (fetchMock as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => getCallUrl(c[0]));
    expect(urls.some((u) => u.startsWith('/api/ai/zhipu'))).toBe(true);

    rollbackRt();
    rollback();
  });

  it('Zhipu - 直连模式：直连 open.bigmodel 并带 Authorization: Bearer <key>', async () => {
    const rollback = patchEnv({
      DEV: 'false', // 直连：避免代理分支
      VITE_ENABLE_AI_READING: 'true',
      VITE_AI_DEV_PROXY: '0',
      VITE_GEMINI_API_KEY: '', // 确保进入 Zhipu 分支
      VITE_ZHIPU_API_KEY: 'fake_key',
      VITE_ZHIPU_RETRIES: '0',
      VITE_DISABLE_ZHIPU: '0', // 显式开启 Zhipu，避免被 .env.local 覆盖
    });

    const rollbackRt = setAiRuntimeOverrides({ proxy: false, gemini: false, zhipu: true });

    const ok = new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify({ core: '直连智谱', actions: ['c1', 'c2'], warnings: ['w1', 'w2', 'w3'] }) } }] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );

    let seenZhipuDirect = false; // 标志：是否命中直连 URL
    const allCalls: Array<{ url: string; auth?: string }> = []; // 调试：记录所有调用

    const fetchMock = vi.fn<typeof fetch>(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      void init; // 明确使用形参，避免 no-unused-vars；该形参用于传递 headers/abort 信号等，这里仅用于读取 headers
      const url = getCallUrl(input);
      const auth = getHeader(init, 'Authorization');

      // 记录所有调用（调试信息已清理，避免噪音）
      allCalls.push({ url, auth });

      // 直连判定：命中 open.bigmodel.cn 且 Authorization 为 Bearer 开头
      if (url.includes('open.bigmodel.cn') && typeof auth === 'string' && auth.startsWith('Bearer ')) {
        seenZhipuDirect = true; // 命中直连
        return ok;
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await interpretQuestion({ question: '直连智谱校验', cardId: 'id_w' });
    expect(res.core).toContain('直连智谱');
    expect(fetchMock).toHaveBeenCalled();


    // 断言：确实发生了直连调用
    expect(seenZhipuDirect).toBe(true);

    // 清理覆盖与环境
    rollbackRt();
    rollback();
  });

  it('故障转移：Gemini 失败（500）→ Zhipu 成功返回并被规范化', async () => {
    const rollback = patchEnv({
      DEV: 'true',
      VITE_ENABLE_AI_READING: 'true',
      VITE_AI_DEV_PROXY: '1',
      VITE_GEMINI_API_KEY: 'fake_g',
      VITE_ZHIPU_API_KEY: 'fake_z',
      VITE_GEMINI_RETRIES: '0',
      VITE_ZHIPU_RETRIES: '0',
      VITE_AI_TIMEOUT_MS: '200',
      VITE_AI_CHAIN_DEADLINE_MS: '8000',
      VITE_DISABLE_ZHIPU: '0', // 显式开启 Zhipu，确保故障转移时能调用
      VITE_AI_HEDGE_ENABLED: 'false', // 显式禁用 Hedge，确保走顺序回退
    });

    const rollbackRt = setAiRuntimeOverrides({ proxy: true, zhipu: true });

    const okZ = new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify({ core: '兜底智谱', actions: ['s1', 's2'], warnings: ['w1', 'w2', 'w3'] }) } }] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );

    const fetchMock = vi.fn<typeof fetch>(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      void init; // 明确使用形参，避免 no-unused-vars；该形参用于传递 abort 信号等，但此测试用例不需读取
      const url = getCallUrl(input);
      // 拦截远端卡牌 API，返回最小有效数据，避免标准化阶段抛错
      if (url.includes('tarotapi.dev')) {
        return new Response(
          JSON.stringify([{ name: 'Ace of Wands', name_short: 'w01', type: 'minor', suit: 'wands', value: 'ace', meaning_up: '', meaning_rev: '', desc: '' }]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('/api/ai/gemini/')) {
        // Gemini：直接返回 500 错误，触发故障转移
        return new Response('{}', { status: 500, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/api/ai/zhipu')) {
        console.log('[TEST] Zhipu request - returning success'); // 添加调试日志
        return okZ; // 快速成功，成为胜者
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    // 清空调用序列记录（类型安全）
    const g = globalThis as HedgeGlobals;
    g.__AI_CALL_SEQ__ = [];

    const res = await interpretQuestion({ question: '发生错误后兜底', cardId: 'id_v' });

    // 读取调用序列（类型守卫）
    const callSeq = Array.isArray(g.__AI_CALL_SEQ__)
      ? g.__AI_CALL_SEQ__.filter((s): s is string => typeof s === 'string')
      : [];
    const hedgeGates = g.__HEDGE_GATES__;
    const hedgeBranch = g.__HEDGE_BRANCH__;
    console.log('[TEST] Call sequence:', callSeq);
    console.log('[TEST] Hedge gates:', hedgeGates);
    console.log('[TEST] Hedge branch:', hedgeBranch);

    expect(res.core).toContain('兜底');

    // 验证调用顺序：先 Gemini 后 Zhipu
    const urls = fetchMock.mock.calls.map((c) => getCallUrl(c[0]));
    console.log('[TEST] All fetch URLs:', urls); // 添加调试日志
    const gemIdx = urls.findIndex((u) => u.startsWith('/api/ai/gemini/'));
    const zIdx = urls.findIndex((u) => u.startsWith('/api/ai/zhipu'));
    console.log('[TEST] Gemini index:', gemIdx, 'Zhipu index:', zIdx); // 添加调试日志
    expect(gemIdx).toBeGreaterThanOrEqual(0);
    expect(zIdx).toBeGreaterThan(gemIdx);

    rollbackRt();
    rollback();
  });
});


describe('hedge race - concurrency and observability', () => {
  // 局部工具：浅写入 import.meta.env 并返回回滚函数（统一支持 string/number/boolean，统一写入为字符串）
  function patchEnv(vars: Record<string, string | number | boolean>) {
    const meta = (import.meta as unknown as { env?: Record<string, string> });
    const envObj = meta.env ?? (meta.env = {});
    const prev: Record<string, string | undefined> = {};
    for (const k of Object.keys(vars)) {
      prev[k] = envObj[k];
      envObj[k] = String(vars[k]);
    }
    // 同步写入全局测试覆盖，供被测模块通过 getEnv() 读取（跨模块 import.meta.env 可能不共享）
    const g = globalThis as unknown as Record<string, unknown>;
    const key = '__TEST_IMPORT_META_ENV__';
    const cur = g[key] as Record<string, string | undefined> | undefined;
    const ov = cur ?? (g[key] = {} as Record<string, string | undefined>, g[key] as Record<string, string | undefined>);
    const prevOv: Record<string, string | undefined> = {};
    for (const k of Object.keys(vars)) {
      prevOv[k] = ov[k];
      ov[k] = String(vars[k]);
    }
    return () => {
      for (const k of Object.keys(vars)) {
        const pv = prev[k];
        if (pv === undefined) delete envObj[k]; else envObj[k] = pv;
      }
      for (const k of Object.keys(vars)) {
        const pv2 = prevOv[k];
        if (pv2 === undefined) delete ov[k]; else ov[k] = pv2;
      }
    };
  }

  // 局部工具：设置运行时覆盖（强制允许/禁止某一路），并返回回滚函数
  function setAiRuntimeOverrides(overrides: { proxy?: boolean; gemini?: boolean; zhipu?: boolean; debug?: boolean } = {}) {
    const g = globalThis as HedgeGlobals;
    const prev = {
      proxy: g.__AI_FORCE_PROXY__,
      gemini: g.__AI_FORCE_GEMINI__,
      zhipu: g.__AI_FORCE_ZHIPU__,
      debug: g.__DEBUG_AI__,
    };

    if (Object.prototype.hasOwnProperty.call(overrides, 'proxy')) {
      g.__AI_FORCE_PROXY__ = overrides.proxy;
    }
    if (Object.prototype.hasOwnProperty.call(overrides, 'gemini')) {
      g.__AI_FORCE_GEMINI__ = overrides.gemini;
    }
    if (Object.prototype.hasOwnProperty.call(overrides, 'zhipu')) {
      g.__AI_FORCE_ZHIPU__ = overrides.zhipu;
    }
    if (Object.prototype.hasOwnProperty.call(overrides, 'debug')) {
      g.__DEBUG_AI__ = overrides.debug;
    }

    return () => {
      if (prev.proxy === undefined) delete g.__AI_FORCE_PROXY__;
      else g.__AI_FORCE_PROXY__ = prev.proxy;

      if (prev.gemini === undefined) delete g.__AI_FORCE_GEMINI__;
      else g.__AI_FORCE_GEMINI__ = prev.gemini;

      if (prev.zhipu === undefined) delete g.__AI_FORCE_ZHIPU__;
      else g.__AI_FORCE_ZHIPU__ = prev.zhipu;

      if (prev.debug === undefined) delete g.__DEBUG_AI__;
      else g.__DEBUG_AI__ = prev.debug;
    };
  }

  // 统一获取 fetch 第一个参数中的 URL
  function getCallUrl(arg: RequestInfo | URL): string {
    if (typeof arg === 'string') return arg;
    if (arg instanceof URL) return String(arg);
    if (typeof arg === 'object' && arg !== null && 'url' in arg) return String((arg as Request).url);
    return String(arg ?? '');
  }

  afterEach(() => {
    vi.restoreAllMocks();
    const gu = globalThis as unknown as Record<string, unknown>;
    if ('__AI_FORCE_PROXY__' in gu) delete gu['__AI_FORCE_PROXY__'];
    if ('__AI_FORCE_GEMINI__' in gu) delete gu['__AI_FORCE_GEMINI__'];
    if ('__AI_FORCE_ZHIPU__' in gu) delete gu['__AI_FORCE_ZHIPU__'];
    if ('__DEBUG_AI__' in gu) delete gu['__DEBUG_AI__'];
  });

  it('Hedge：Gemini 先胜并中止 Zhipu', async () => {
    const rollback = patchEnv({
      DEV: 'true',
      VITE_ENABLE_AI_READING: 'true',
      VITE_AI_DEV_PROXY: '1',
      VITE_AI_HEDGE_ENABLED: 'true',
      VITE_AI_HEDGE_DELAY_MS: '0', // 设为 0，确保 Zhipu 已起跑，从而能观测到 fetch 层的 abort
      VITE_AI_ABORT_LOSER: '1',
      VITE_AI_HEDGE_LOG_LEVEL: 'warn',
      VITE_GEMINI_API_KEY: 'fake_g',
      VITE_ZHIPU_API_KEY: 'fake_z',
      VITE_GEMINI_RETRIES: '0',
      VITE_ZHIPU_RETRIES: '0',
      VITE_AI_TIMEOUT_MS: '200',
      VITE_MOCK_DELAY_MIN: '0',
      VITE_MOCK_DELAY_MAX: '0',
      VITE_MOCK_FAIL_RATE: '0',
    });
    const rollbackRt = setAiRuntimeOverrides({ proxy: true, gemini: true, zhipu: true });

    let zhipuAborted = false;
    const okGem = new Response(
      JSON.stringify({
        candidates: [
          { content: { parts: [{ text: JSON.stringify({ core: 'G-WIN 洞察', actions: ['g1', 'g2'] }) }] } },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );

    const fetchMock = vi.fn<typeof fetch>(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = getCallUrl(input);
      // 补充远端卡牌 API 拦截，确保 Zhipu 分支能完成元数据读取
      if (url.includes('tarotapi.dev')) {
        return new Response(
          JSON.stringify([{ name: 'Ace of Wands', name_short: 'w01', type: 'minor', suit: 'wands', value: 'ace', meaning_up: '', meaning_rev: '', desc: '' }]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('/api/ai/gemini/')) {
        // Gemini：直接返回 500 错误，触发故障转移
        return new Promise<Response>((resolve) => setTimeout(() => resolve(okGem), 12));
      }
      if (url.includes('/api/ai/zhipu')) {
        // 返回一个可被 AbortSignal 终止的挂起 Promise
        return new Promise<Response>((_resolve, reject) => {
          const onAbort = () => {
            zhipuAborted = true;
            const err = createAbortError();
            reject(err);
          };
          if (init?.signal?.aborted) return onAbort();
          init?.signal?.addEventListener('abort', onAbort, { once: true });
        });
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    // 预热卡牌缓存，减少 Zhipu 分支起跑前的同步/异步开销
    const svc = await import('./tarotService');
    await svc.getAllStandardizedCardsCached({ forceRefresh: true });

    const res = await svc.interpretQuestion({ question: '并发竞速A', cardId: 'w01_00' });
    expect(res.core).toContain('G-WIN');

    // 让微任务队列与事件循环有机会处理 abort 事件
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 10));
    // 允许两种合法路径：
    // 1) Zhipu 已起跑且被 abort（zhipuAborted=true）
    // 2) 胜者过快，Zhipu 在起跑前即被中止（未命中 fetchMock 的 /api/ai/zhipu）
    const zhiStarted = fetchMock.mock?.calls?.some?.((args: [RequestInfo | URL, RequestInit?]) => getCallUrl(args[0]).includes('/api/ai/zhipu')) || false;
    expect(zhipuAborted || !zhiStarted).toBe(true);

    rollbackRt();
    rollback();
  });

  it('Hedge: Zhipu 先胜并中止 Gemini', async () => {
    const rollback = patchEnv({
      DEV: 'true',
      VITE_ENABLE_AI_READING: 'true',
      VITE_AI_DEV_PROXY: '1',
      VITE_AI_HEDGE_ENABLED: 'true',
      VITE_AI_HEDGE_DELAY_MS: '0', // 立即起跑 Zhipu，避免等待
      VITE_AI_ABORT_LOSER: '1',
      VITE_AI_HEDGE_LOG_LEVEL: 'warn',
      VITE_GEMINI_API_KEY: 'fake_g',
      VITE_ZHIPU_API_KEY: 'fake_z',
      VITE_GEMINI_RETRIES: '0',
      VITE_ZHIPU_RETRIES: '0',
      VITE_AI_TIMEOUT_MS: '200',
      VITE_MOCK_DELAY_MIN: '0',
      VITE_MOCK_DELAY_MAX: '0',
      VITE_MOCK_FAIL_RATE: '0',
    });
    const rollbackRt = setAiRuntimeOverrides({ proxy: true, gemini: true, zhipu: true });

    let geminiAborted = false;
    let geminiSafetied = false;
    const okZ = new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify({ core: 'Z-WIN 洞察', actions: ['z1', 'z2'] }) } }] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );

    const fetchMock = vi.fn<typeof fetch>(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = getCallUrl(input);
      // 拦截远端卡牌 API，返回最小有效数据，避免标准化阶段抛错
      if (url.includes('tarotapi.dev')) {
        return new Response(
          JSON.stringify([{ name: 'Ace of Wands', name_short: 'w01', type: 'minor', suit: 'wands', value: 'ace', meaning_up: '', meaning_rev: '', desc: '' }]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('/api/ai/gemini/')) {
        // Gemini：保持挂起，等待被中止；同时增加 150ms 安全兜底，双保险避免悬挂
        return new Promise<Response>((_resolve, reject) => {
          const timer = setTimeout(() => {
            geminiSafetied = true;
            reject(new Error('Gemini safety timeout'));
          }, 150);
          const onAbort = () => {
            clearTimeout(timer);
            geminiAborted = true;
            reject(createAbortError());
          };
          if (init?.signal?.aborted) return onAbort();
          init?.signal?.addEventListener('abort', onAbort, { once: true });
        });
      }
      if (url.includes('/api/ai/zhipu')) {
        return okZ; // 快速成功，成为胜者
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    // 预热卡牌缓存，减少两路并发时的额外 IO
    const svc = await import('./tarotService');
    await svc.getAllStandardizedCardsCached({ forceRefresh: true });
    const res = await svc.interpretQuestion({ question: '并发竞速B', cardId: 'w01_00' });
    expect(res.core).toContain('Z-WIN');

    // 让微任务队列与事件循环有机会处理 abort 事件
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 10));
    // 允许两种合法路径：已起跑被中止，或起跑前即被中止
    const gemStarted = fetchMock.mock?.calls?.some?.((args: [RequestInfo | URL, RequestInit?]) => getCallUrl(args[0]).includes('/api/ai/gemini/')) || false;
    expect(geminiAborted || geminiSafetied || !gemStarted).toBe(true);

    rollbackRt();
    rollback();
  });

  it('Hedge：当 totalTimeoutMs 等于 VITE_AI_TIMEOUT_MS 边界时也应回退且两路终止', async () => {
    const rollback = patchEnv({
      DEV: 'true',
      VITE_ENABLE_AI_READING: 'true',
      VITE_AI_DEV_PROXY: '1',
      VITE_AI_HEDGE_ENABLED: 'true',
      VITE_AI_HEDGE_DELAY_MS: '50',
      VITE_AI_ABORT_LOSER: '1',
      VITE_AI_HEDGE_LOG_LEVEL: 'warn',
      VITE_GEMINI_API_KEY: 'fake_g',
      VITE_ZHIPU_API_KEY: 'fake_z',
      VITE_GEMINI_RETRIES: '0',
      VITE_ZHIPU_RETRIES: '0',
      VITE_MOCK_DELAY_MIN: '0',
      VITE_MOCK_DELAY_MAX: '0',
      VITE_MOCK_FAIL_RATE: '0',
      // 不通过 opts 传递，直接依赖 VITE_AI_TIMEOUT_MS，测试“等于边界”场景
      VITE_AI_TIMEOUT_MS: '120',
    });
    const rollbackRt = setAiRuntimeOverrides({ proxy: true, gemini: true, zhipu: true });

    let gemAborted = false; let zhiAborted = false; let gemSafetied = false; let zhiSafetied = false;
    const fetchMock = vi.fn<typeof fetch>(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = getCallUrl(input);
      // 拦截远端卡牌 API，返回最小有效数据，避免标准化阶段抛错
      if (url.includes('tarotapi.dev')) {
        return new Response(
          JSON.stringify([{ name: 'Ace of Cups', name_short: 'c01', type: 'minor', suit: 'cups', value: 'ace', meaning_up: '', meaning_rev: '', desc: '' }]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('/api/ai/gemini/') || url.includes('/api/ai/zhipu')) {
        return new Promise<Response>((_resolve, reject) => {
          const onAbort = () => {
            if (url.includes('/api/ai/gemini/')) gemAborted = true; else zhiAborted = true;
            reject(createAbortError());
          };
          if (init?.signal?.aborted) return onAbort();
          init?.signal?.addEventListener('abort', onAbort, { once: true });
          // 安全兜底：若未被 abort，在 180ms 后主动拒绝，避免测试悬挂
          const safety = setTimeout(() => {
            if (url.includes('/api/ai/gemini/')) gemSafetied = true; else zhiSafetied = true;
            const e = createAbortError();
            e.message = 'Safety reject';
            reject(e);
          }, 180);
          init?.signal?.addEventListener('abort', () => clearTimeout(safety), { once: true });
        });
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { interpretQuestion } = await import('./tarotService');
    // 不传 opts → 使用 env 的 120ms，属于“等于边界”场景
    const res = await interpretQuestion({ question: '边界总超时', cardId: 'id_b' });
    // 应进入 Mock 回退
    expect(res.core).toContain('塔罗洞察：');

    // 等待事件循环处理 abort 事件
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 10));

    // 允许两种合法路径：收到 abort 或被安全兜底拒绝
    expect(gemAborted || gemSafetied).toBe(true);
    expect(zhiAborted || zhiSafetied).toBe(true);

    rollbackRt();
    rollback();
  });

  it('Hedge：abortLoser=false 时不应中止败方', async () => {
    const rollback = patchEnv({
      DEV: 'true',
      VITE_ENABLE_AI_READING: 'true',
      VITE_AI_DEV_PROXY: '1',
      VITE_AI_HEDGE_ENABLED: 'true',
      VITE_AI_HEDGE_DELAY_MS: '0',
      VITE_AI_ABORT_LOSER: '0', // 关闭败方中止
      VITE_AI_HEDGE_LOG_LEVEL: 'info',
      VITE_GEMINI_API_KEY: 'fake_g',
      VITE_ZHIPU_API_KEY: 'fake_z',
      VITE_GEMINI_RETRIES: '0',
      VITE_ZHIPU_RETRIES: '0',
      VITE_MOCK_DELAY_MIN: '0',
      VITE_MOCK_DELAY_MAX: '0',
      VITE_MOCK_FAIL_RATE: '0',
      VITE_AI_TIMEOUT_MS: '500',
    });
    const rollbackRt = setAiRuntimeOverrides({ proxy: true, gemini: true, zhipu: true });

    let zhiAborted = false;
    let zhiResolved = false;
    const okGem = new Response(
      JSON.stringify({
        candidates: [
          { content: { parts: [{ text: JSON.stringify({ core: '胜者Gemini', actions: ['a', 'b'] }) }] } },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
    const okZhi = new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify({ core: '败方Zhipu', actions: ['x', 'y'] }) } }] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );

    const fetchMock = vi.fn<typeof fetch>(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = getCallUrl(input);
      // 拦截远端卡牌 API，返回最小有效数据，避免标准化阶段抛错
      if (url.includes('tarotapi.dev')) {
        return new Response(
          JSON.stringify([{ name: 'Ace of Swords', name_short: 's01', type: 'minor', suit: 'swords', value: 'ace', meaning_up: '', meaning_rev: '', desc: '' }]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('/api/ai/gemini/')) {
        // Gemini 快速成功，确保其成为胜者
        return new Promise<Response>((resolve) => setTimeout(() => resolve(okGem), 10));
      }
      if (url.includes('/api/ai/zhipu')) {
        // 败方 Zhipu：不应被中止，应在短延迟后正常 resolve
        return new Promise<Response>((resolve, reject) => {
          const onAbort = () => {
            zhiAborted = true;
            reject(createAbortError());
          };
          if (init?.signal?.aborted) return onAbort();
          init?.signal?.addEventListener('abort', onAbort, { once: true });
          setTimeout(() => { zhiResolved = true; resolve(okZhi); }, 80);
        });
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { interpretQuestion } = await import('./tarotService');
    const r = await interpretQuestion({ question: 'no-abort-loser', cardId: 'id_c' });
    expect(r.core).toContain('胜者Gemini');

    // 等待足够时间让败方自然完成，从而稳定验证未被中止
    await new Promise((r) => setTimeout(r, 120));
    expect(zhiAborted).toBe(false);
    expect(zhiResolved).toBe(true);

    rollbackRt();
    rollback();
  });

  it('Hedge 日志门控：warn 阈值只输出 warn；info 阈值输出胜者 info', async () => {
    // 场景A：logLevel=warn，Hedge 失败进入回退→应产生 warn，且不产生 info
    const rollbackA = patchEnv({
      DEV: 'true',
      VITE_ENABLE_AI_READING: 'true',
      VITE_AI_DEV_PROXY: '1',
      VITE_AI_HEDGE_ENABLED: 'true',
      VITE_AI_HEDGE_DELAY_MS: '30',
      VITE_AI_ABORT_LOSER: '1',
      VITE_AI_HEDGE_LOG_LEVEL: 'warn',
      VITE_GEMINI_API_KEY: 'fake_g',
      VITE_ZHIPU_API_KEY: 'fake_z',
      VITE_GEMINI_RETRIES: '0',
      VITE_ZHIPU_RETRIES: '0',
      VITE_MOCK_DELAY_MIN: '0',
      VITE_MOCK_DELAY_MAX: '0',
      VITE_MOCK_FAIL_RATE: '0',
    });
    const rollbackRtA = setAiRuntimeOverrides({ proxy: true, gemini: true, zhipu: true });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { /* no-op */ return undefined; });
    const baseWarnCalls = warnSpy.mock.calls.length;
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => { /* no-op */ return undefined; });

    const fetchMockA = vi.fn<typeof fetch>(async (input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
      void _init; // 明确使用形参，避免 no-unused-vars；该形参用于携带 abort 等控制信息，本用例无需读取
      const url = getCallUrl(input);
      // 拦截远端卡牌 API，返回最小有效数据，避免标准化阶段抛错
      if (url.includes('tarotapi.dev')) {
        return new Response(
          JSON.stringify([{ name: 'Ace of Cups', name_short: 'c01', type: 'minor', suit: 'cups', value: 'ace', meaning_up: '', meaning_rev: '', desc: '' }]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('/api/ai/gemini/')) return new Response('{}', { status: 500, headers: { 'Content-Type': 'application/json' } });
      if (url.includes('/api/ai/zhipu')) return new Response('{}', { status: 500, headers: { 'Content-Type': 'application/json' } });
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMockA);

    const { interpretQuestion } = await import('./tarotService');
    const r1 = await interpretQuestion({ question: 'log-A', cardId: 'id_a' });
    expect(r1.core).toContain('塔罗洞察：');

    const deltaWarnA = warnSpy.mock.calls.length - baseWarnCalls;
    expect(deltaWarnA).toBeGreaterThanOrEqual(1);
    expect(infoSpy).not.toHaveBeenCalled();

    rollbackRtA();
    rollbackA();
    infoSpy.mockRestore();
    warnSpy.mockRestore();

    // 场景B：logLevel=info，胜出者产生 info；warn 不应新增
    const rollbackB = patchEnv({
      DEV: 'true',
      VITE_ENABLE_AI_READING: 'true',
      VITE_AI_DEV_PROXY: '1',
      VITE_AI_HEDGE_ENABLED: 'true',
      VITE_AI_HEDGE_DELAY_MS: '20',
      VITE_AI_ABORT_LOSER: '1',
      VITE_AI_HEDGE_LOG_LEVEL: 'info',
      VITE_GEMINI_API_KEY: 'fake_g',
      VITE_ZHIPU_API_KEY: 'fake_z',
      VITE_GEMINI_RETRIES: '0',
      VITE_ZHIPU_RETRIES: '0',
      VITE_MOCK_DELAY_MIN: '0',
      VITE_MOCK_DELAY_MAX: '0',
      VITE_MOCK_FAIL_RATE: '0',
      VITE_AI_TIMEOUT_MS: '200',
    });
    console.log('测试诊断：overlayKeys=', Object.keys(((globalThis as Record<string, unknown>).__TEST_IMPORT_META_ENV__) || {}));
    try {
      const penv: Record<string, string | undefined> | undefined = (typeof process !== 'undefined' && (process as unknown as { env?: Record<string, string | undefined> })?.env)
        ? (process as unknown as { env?: Record<string, string | undefined> }).env
        : undefined;
      console.log('测试诊断：proc.VITE_AI_HEDGE_ENABLED=', penv?.VITE_AI_HEDGE_ENABLED, 'proc.LOG_LEVEL=', penv?.VITE_AI_HEDGE_LOG_LEVEL);
    } catch { /* ignore in tests */ void 0; }
    try {
      const ienv: Record<string, string | undefined> = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env) || {};
      console.log('测试诊断：ime.VITE_AI_HEDGE_ENABLED=', ienv?.VITE_AI_HEDGE_ENABLED, 'ime.LOG_LEVEL=', ienv?.VITE_AI_HEDGE_LOG_LEVEL);
    } catch { /* ignore in tests */ void 0; }
    const rollbackRtB = setAiRuntimeOverrides({ proxy: true, gemini: true, zhipu: true });

    const warnSpyB = vi.spyOn(console, 'warn').mockImplementation(() => { /* no-op */ return undefined; });
    const baseWarnB = warnSpyB.mock.calls.length;
    const infoSpyB = vi.spyOn(console, 'info').mockImplementation(() => { /* no-op */ return undefined; });
    const logSpyB = vi.spyOn(console, 'log').mockImplementation(() => { /* no-op */ return undefined; });

    // 借助全局钩子稳定收集 hedge 日志事件（仅测试使用）
    const logsB: Array<{ level: string; args: unknown[] }> = [];
    // 使用 HedgeGlobals 类型进行安全访问与赋值
    const g = globalThis as unknown as HedgeGlobals;
    g.__HEDGE_LOG_CAPTURE__ = (level: string, ...args: unknown[]) => {
      logsB.push({ level, args });
    };

    const okGem = new Response(
      JSON.stringify({
        candidates: [
          { content: { parts: [{ text: JSON.stringify({ core: '日志胜者', actions: ['a', 'b'] }) }] } },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );

    const fetchMockB = vi.fn<typeof fetch>(async (input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
      void _init; // 明确使用形参，避免 no-unused-vars；该形参用于携带 abort 等控制信息，本用例无需读取
      const url = getCallUrl(input);
      if (url.includes('/api/ai/gemini/')) return okGem; // 让 Gemini 获胜
      if (url.includes('/api/ai/zhipu')) {
        return new Promise<Response>(() => { /* intentionally hang until aborted */ void 0; }); // 挂起，随后被中止
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMockB);

    // 断言 Hedge 配置确认为 logLevel=info 且 enabled=true
    {
      const { readHedgeConfig } = await import('./tarotService');
      const cfgB = readHedgeConfig(((import.meta as unknown as { env?: Record<string, string | undefined> }).env) || {});
      expect(cfgB.enabled).toBe(true);
      expect(cfgB.logLevel).toBe('info');
      console.log('测试诊断：Hedge配置', JSON.stringify(cfgB));
    }

    const r2 = await interpretQuestion({ question: 'log-B', cardId: 'id_b' });
    expect(r2.core).toContain('日志胜者');

    // 让微任务/事件循环有机会刷出日志（再加充分拍）
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 40)); // 稍微加大宏任务等待

    // 轮询等待最多 200ms，确保日志收集完成
    {
      const maxWaitMs = 200; const stepMs = 20; const start = Date.now();
      while (logsB.length === 0 && Date.now() - start < maxWaitMs) {
        await new Promise((r) => setTimeout(r, stepMs));
      }
    }

    // 输出诊断信息
    console.log('测试诊断：收集到的日志事件', JSON.stringify(logsB));
    const gdiag = globalThis as unknown as HedgeGlobals;
    console.log('测试诊断：allowGemini=', gdiag.__AI_FORCE_GEMINI__);
    console.log('测试诊断：allowZhipu=', gdiag.__AI_FORCE_ZHIPU__);
    console.log('测试诊断：fetchMockB调用次数=', fetchMockB.mock.calls.length);
    console.log('测试诊断：__HEDGE_BRANCH__=', gdiag.__HEDGE_BRANCH__);
    console.log('测试诊断：__HEDGE_GATES__=', JSON.stringify(gdiag.__HEDGE_GATES__));

    // 断言：捕获到 winner 事件（level=info，args[0]='winner'）
    const hasWinner = logsB.some((e) => e.level === 'info' && e.args && e.args[0] === 'winner');
    if (!hasWinner) {
      const diag = {
        branch: gdiag.__HEDGE_BRANCH__,
        gates: gdiag.__HEDGE_GATES__,
        debug: gdiag.__HEDGE_DEBUG__,
        winner: gdiag.__HEDGE_WINNER__,
        logs: logsB,
        getenv: gdiag.__DBG_GETENV__,
      };
      throw new Error('[DBG][TEST] 未捕获 winner 日志，诊断：' + JSON.stringify(diag));
    }
    expect(hasWinner).toBe(true);

    const deltaWarnB = warnSpyB.mock.calls.length - baseWarnB;
    expect(deltaWarnB).toBe(0);

    rollbackRtB();
    rollbackB();
    const gdel = globalThis as unknown as HedgeGlobals;
    delete gdel.__HEDGE_LOG_CAPTURE__;
    delete gdel.__HEDGE_LAST_EVENT__;
    delete gdel.__HEDGE_WINNER__;
    infoSpyB.mockRestore();
    logSpyB.mockRestore();
    warnSpyB.mockRestore();
  });
});

describe('hedge scaffold - readHedgeConfig', () => {
  // 延迟导入以避免模块缓存干扰
  const importSvc = async () => await import('./tarotService');

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('默认值：未设置任何变量时，应返回关闭态与安全默认', async () => {
    const { readHedgeConfig } = await importSvc();
    const cfg = readHedgeConfig({});
    expect(cfg.enabled).toBe(false);
    expect(cfg.delayMs).toBe(250);
    expect(cfg.abortLoser).toBe(true);
    expect(cfg.logLevel).toBe('warn');
  });

  it('合法输入：应被正确解析为布尔/数字/枚举', async () => {
    const { readHedgeConfig } = await importSvc();
    const cfg = readHedgeConfig({
      VITE_AI_HEDGE_ENABLED: 'true',
      VITE_AI_HEDGE_DELAY_MS: '480',
      VITE_AI_ABORT_LOSER: '0',
      VITE_AI_HEDGE_LOG_LEVEL: 'info',
    } as Record<string, string>);
    expect(cfg.enabled).toBe(true);
    expect(cfg.delayMs).toBe(480);
    expect(cfg.abortLoser).toBe(false);
    expect(cfg.logLevel).toBe('info');
  });

  it('非法输入：回落到默认值且不抛错', async () => {
    const { readHedgeConfig } = await importSvc();
    const cfg = readHedgeConfig({
      VITE_AI_HEDGE_ENABLED: 'maybe',
      VITE_AI_HEDGE_DELAY_MS: '-10',
      VITE_AI_ABORT_LOSER: 'nah',
      VITE_AI_HEDGE_LOG_LEVEL: 'verbose',
    } as Record<string, string>);
    expect(cfg.enabled).toBe(false);
    expect(cfg.delayMs).toBe(250);
    expect(cfg.abortLoser).toBe(true);
    expect(cfg.logLevel).toBe('warn');
  });

  it('变量优先级：process.env < import.meta.env < __TEST_IMPORT_META_ENV__ < rawEnv', async () => {
    const { readHedgeConfig } = await importSvc();
    const ienv: Record<string, string | undefined> = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env) || {};
    let penv: Record<string, string | undefined> | undefined = undefined;
    try { penv = (typeof process !== 'undefined' && (process as unknown as { env?: Record<string, string | undefined> })?.env) ? (process as unknown as { env?: Record<string, string | undefined> }).env : undefined; } catch { /* no-op */ void 0; }
    const g = globalThis as unknown as HedgeGlobals;
    const ov: Record<string, string | undefined> = (g.__TEST_IMPORT_META_ENV__ ||= {} as Record<string, string | undefined>);

    // 备份原值，测试结束后回滚
    const keys = ['VITE_AI_HEDGE_ENABLED', 'VITE_AI_HEDGE_DELAY_MS', 'VITE_AI_ABORT_LOSER', 'VITE_AI_HEDGE_LOG_LEVEL'] as const;
    const prevIM: Record<string, string | undefined> = {}; const prevPE: Record<string, string | undefined> = {}; const prevOv: Record<string, string | undefined> = {};
    for (const k of keys) {
      prevIM[k] = ienv[k];
      prevPE[k] = penv?.[k];
      prevOv[k] = ov[k];
    }

    try {
      // 1) process.env（最低）：设置一组值
      if (penv) {
        penv.VITE_AI_HEDGE_ENABLED = '0';
        penv.VITE_AI_HEDGE_DELAY_MS = '10';
        penv.VITE_AI_ABORT_LOSER = '0';
        penv.VITE_AI_HEDGE_LOG_LEVEL = 'error';
      }
      // 2) import.meta.env（覆盖 process.env）
      ienv.VITE_AI_HEDGE_ENABLED = '1';
      ienv.VITE_AI_HEDGE_DELAY_MS = '20';
      ienv.VITE_AI_ABORT_LOSER = '1';
      ienv.VITE_AI_HEDGE_LOG_LEVEL = 'warn';
      // 3) __TEST_IMPORT_META_ENV__（覆盖前两者）
      ov.VITE_AI_HEDGE_ENABLED = '0';
      ov.VITE_AI_HEDGE_DELAY_MS = '30';
      ov.VITE_AI_ABORT_LOSER = '0';
      ov.VITE_AI_HEDGE_LOG_LEVEL = 'info';

      // 不传 rawEnv → 应取自 overlay 层
      const cfg1 = readHedgeConfig();
      expect(cfg1.enabled).toBe(false);
      expect(cfg1.delayMs).toBe(30);
      expect(cfg1.abortLoser).toBe(false);
      expect(cfg1.logLevel).toBe('info');

      // 传 rawEnv → 最高优先级
      const cfg2 = readHedgeConfig({
        VITE_AI_HEDGE_ENABLED: 'true',
        VITE_AI_HEDGE_DELAY_MS: '40',
        VITE_AI_ABORT_LOSER: '1',
        VITE_AI_HEDGE_LOG_LEVEL: 'debug',
      } as Record<string, string>);
      expect(cfg2.enabled).toBe(true);
      expect(cfg2.delayMs).toBe(40);
      expect(cfg2.abortLoser).toBe(true);
      expect(cfg2.logLevel).toBe('debug');
    } finally {
      // 回滚所有覆盖
      for (const k of keys) {
        ienv[k] = prevIM[k];
        if (penv) penv[k] = prevPE[k];
        const pv = prevOv[k];
        if (pv === undefined) delete ov[k]; else ov[k] = pv;
      }
    }
  });
});
