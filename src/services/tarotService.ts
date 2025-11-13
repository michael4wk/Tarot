import { getCardImagePath } from '@/utils/images';
import { withReversal, DEFAULT_REVERSED_PROB } from '@/utils/reversal';
import type { ArcanaType, SuitType } from '@/utils/images';

// 原始 API 卡牌类型（必要字段子集）
export interface RawTarotCard {
  name: string;
  name_short: string;
  type: ArcanaType;
  suit?: SuitType | null;
  value: string;
  meaning_up?: string;
  meaning_rev?: string;
  desc?: string;
}

// 标准化后的卡牌数据（对 UI/业务开放的稳定结构）
export interface StandardCard {
  id: string;
  uniqueId: string;
  name: string;
  name_short: string;
  type: ArcanaType;
  suit: SuitType | null;
  value: string;
  meaning_up: string;
  meaning_rev: string;
  desc: string;
  indexPosition: number;
  isReversed: boolean;
  frontSrc: string;
}

// 新增：统一数据源缓存（本地缓存 + 版本控制）与强制刷新检测
const DECK_CACHE_KEY = 'tarot2:deck:std:v1';
interface DeckCache {
  version: string;
  timestamp: number;
  cards: StandardCard[];
}
function getAppVersion(): string {
  return String(import.meta.env?.VITE_APP_VERSION || 'dev');
}
export function detectForceRefresh(): boolean {
  try {
    const nav = performance.getEntriesByType?.('navigation')?.[0] as
      | PerformanceNavigationTiming
      | undefined;
    if (nav && nav.type === 'reload') return true;
    // 兼容旧版 performance.navigation，使用 unknown 索引访问避免 any
    const legacyNav = (performance as unknown as { navigation?: unknown }).navigation;
    const legacyType = legacyNav && typeof legacyNav === 'object' ? (legacyNav as Record<string, unknown>)['type'] : undefined;
    if (legacyType === 1) return true; // 1 === TYPE_RELOAD（已废弃 API 的兼容）
  } catch {
    /* no-op */
  }
  return false;
}
function loadDeckFromCache(): DeckCache | null {
  try {
    const raw = localStorage.getItem(DECK_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DeckCache;
  } catch {
    return null;
  }
}
function saveDeckToCache(cache: DeckCache): void {
  try {
    localStorage.setItem(DECK_CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* ignore quota */
  }
}
export interface GetAllOptions {
  reversedProbability?: number;
  forceRefresh?: boolean;
  // 新增：网络健壮性参数（可选，保留默认值以兼容现有行为）
  timeoutMs?: number; // 单次请求超时时间
  retries?: number; // 重试次数（额外次数，不含首次）
  baseDelayMs?: number; // 指数退避起始延迟
}

// 内部错误分类结构（用于日志与重试决策，生产不对外抛出该对象）
interface ServiceErrorInfo {
  type: 'TIMEOUT' | 'NETWORK' | 'HTTP' | 'CANCELLED';
  status?: number;
  retriable: boolean;
  message: string;
}

// 将 Error 归一化为错误信息，便于判断是否可重试
function classifyError(err: unknown): ServiceErrorInfo {
  // 统一抽取常见字段，便于判断
  const rec = err && typeof err === 'object' ? (err as Record<string, unknown>) : {};
  const name = typeof rec['name'] === 'string' ? (rec['name'] as string) : undefined;
  const message: string | undefined = typeof rec['message'] === 'string' ? (rec['message'] as string) : undefined;
  // abortReason 由 fetchWithTimeout 主动附加；兼容部分环境下的 err.reason
  const abortReason: unknown = rec['abortReason'] ?? rec['reason'];

  // 1) AbortError 情况细分：区分“业务取消(CANCELLED)”与“真正超时(TIMEOUT)”
  if (name === 'AbortError') {
    const reason = String(abortReason ?? '');
    // 这些 reason 来自 hedge 逻辑的“预期内取消”，不应重试也不应告警
    if (reason === 'loser-abort' || reason === 'total-timeout-or-all-failed' || reason === 'aborted-before-start') {
      return { type: 'CANCELLED', retriable: false, message: '请求已取消' };
    }
    // 明确为本地超时或未知原因：按超时处理（可重试）
    if (reason === 'timeout' || reason === '') {
      return { type: 'TIMEOUT', retriable: true, message: '请求超时' };
    }
    // 其他未知的 AbortError 一律视为取消，保持保守不重试，避免误伤
    return { type: 'CANCELLED', retriable: false, message: '请求已取消' };
  }

  // 2) 兼容在发起前即被中止时抛出的普通 Error（非 AbortError）
  if (typeof message === 'string' && message === 'aborted-before-start') {
    return { type: 'CANCELLED', retriable: false, message: '请求已取消' };
  }

  // 3) 我们在 fetchWithTimeout 中抛出的 HTTP 错误会附带 status
  const statusUnknown = rec['status'];
  if (typeof statusUnknown === 'number') {
    if (statusUnknown === 504) {
      return { type: 'TIMEOUT', status: 504, retriable: true, message: '网关超时' };
    }
    const retriable = statusUnknown >= 500 || statusUnknown === 429;
    return { type: 'HTTP', status: statusUnknown, retriable, message: `HTTP ${statusUnknown}` };
  }

  // 4) 其余情况视为网络错误（离线/跨域/被阻止等）
  return { type: 'NETWORK', retriable: true, message: message || '网络错误' };
}

// 轻量 sleep，用于指数退避
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 本地实现：返回“第一个成功 resolve 的结果”；若全部 reject，则整体 reject
// 说明：
// - 不能直接使用 Promise.any，因为它在所有输入都 reject 时会抛出 AggregateError，
//   同时我们需要在 TS/运行环境更广的兼容行为下进行精细控制；
// - 该实现与 hedge 竞速逻辑配合：两路并发时，优先选择第一个成功者，
//   若两路都失败，则抛出最后一个错误（或组合错误信息）；
// - 保持泛型 T 以获得良好的类型推断。
async function promiseAnyFulfilled<T>(promises: Promise<T>[]): Promise<T> {
  if (!Array.isArray(promises) || promises.length === 0) {
    return Promise.reject(new Error('No promises provided'));
  }
  return new Promise<T>((resolve, reject) => {
    let pending = promises.length;
    const errors: unknown[] = [];

    for (const p of promises) {
      Promise.resolve(p)
        .then((val) => {
          // 第一个成功立刻返回
          resolve(val);
        })
        .catch((err) => {
          errors.push(err);
          pending -= 1;
          if (pending === 0) {
            // 全部失败，抛出一个合成错误，避免依赖 AggregateError 类型
            const msg = errors.map((e) => (e instanceof Error ? e.message : String(e))).join(' | ');
            reject(new Error(msg || 'All promises rejected'));
          }
        });
    }
  });
}

// 带超时的 fetch：保持轻薄，只负责超时与 HTTP 状态判断
async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit & { timeout?: number; signal?: AbortSignal } = {},
): Promise<unknown> {
  const { timeout = 8000, signal, ...rest } = init;
  const controller = new AbortController();
  // 记录中止原因：用于上层分类（业务取消 vs 真超时）
  let abortReason: unknown | undefined;
  const onAbort = () => {
    // 读取外部 signal 的 reason（如 'loser-abort'）并透传
    const extReason = (signal as (AbortSignal & { reason?: unknown }) | undefined)?.reason;
    abortReason = extReason ?? 'external-abort';
    try { controller.abort(extReason as unknown as string); } catch { controller.abort(); }
  };
  if (signal) {
    if (signal.aborted) {
      const extReason = (signal as (AbortSignal & { reason?: unknown }) | undefined)?.reason;
      abortReason = extReason ?? 'external-abort';
      try { controller.abort(extReason as unknown as string); } catch { controller.abort(); }
    } else {
      signal.addEventListener('abort', onAbort, { once: true });
    }
  }
  const id = setTimeout(() => {
    abortReason = 'timeout';
    try { controller.abort('timeout'); } catch { controller.abort(); }
  }, timeout);
  try {
    const res = await fetch(input, { ...rest, signal: controller.signal });
    if (!res.ok) {
      throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
    }
    // 解析优化：优先读取文本，再尝试 JSON.parse；若解析失败则返回原始字符串
    const text = await res.text();
    try {
      if (!text) return '';
      return JSON.parse(text);
    } catch {
      // 避免 SyntaxError 导致被误判为 NETWORK，将原始字符串交给上层处理
      return text;
    }
    return await res.json();
  } catch (err) {
    const name = (err as { name?: unknown })?.name;
    if (name === 'AbortError') {
      const wrapped = new Error((err as { message?: string })?.message || 'Aborted');
      wrapped.name = 'AbortError';
      (wrapped as unknown as { abortReason?: unknown }).abortReason = abortReason;
      try { (wrapped as unknown as { cause?: unknown }).cause = err; } catch { /* no-op */ void 0; }
      throw wrapped;
    }
    throw err;
  } finally {
    clearTimeout(id);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

// 新增：带重试（指数退避+抖动）的 JSON 请求
async function fetchJsonWithRetry(
  input: RequestInfo | URL,
  {
    timeoutMs = 6000,
    retries = 2,
    baseDelayMs = 300,
    signal,
  }: { timeoutMs?: number; retries?: number; baseDelayMs?: number; signal?: AbortSignal } = {},
): Promise<unknown> {
  let attempt = 0;
  const maxAttempts = retries + 1;

  while (attempt < maxAttempts) {
    try {
      return await fetchWithTimeout(input, { timeout: timeoutMs, signal });
    } catch (e) {
      attempt += 1;
      const info = classifyError(e);

      // 仅在 DEV 输出诊断信息，生产静默
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn('[tarotService] 请求失败', { attempt, info });
      }

      // 不可重试或已用尽重试次数时，抛出给上层按既有逻辑回退
      if (!info.retriable || attempt >= maxAttempts) {
        throw e;
      }

      // 计算指数退避 + 抖动（±20%），上限 1500ms
      const jitter = 0.2 + Math.random() * 0.4; // [0.2, 0.6)
      const base = baseDelayMs * Math.pow(2, attempt - 1);
      const wait = Math.min(1500, Math.floor(base * jitter));
      await delay(wait);
    }
  }

  // 理论上不可达
  throw new Error('Unreachable retry loop');
}

// 标准化器
class TarotDataStandardizer {
  standardizeCard(raw: RawTarotCard, index: number): Omit<StandardCard, 'isReversed'> {
    const id = this.generateUniqueId(raw, index);
    const suit = (raw.suit as SuitType) ?? null;
    const type = raw.type;
    const value = raw.value;

    const frontSrc = getCardImagePath({ type, value, suit: suit ?? undefined });

    return {
      id,
      uniqueId: id,
      name: raw.name ?? raw.name_short ?? id,
      name_short: raw.name_short ?? id,
      type,
      suit,
      value,
      meaning_up: raw.meaning_up ?? '',
      meaning_rev: raw.meaning_rev ?? '',
      desc: raw.desc ?? '',
      indexPosition: index,
      frontSrc,
    };
  }

  standardizeCards(rawCards: RawTarotCard[]): Array<Omit<StandardCard, 'isReversed'>> {
    return rawCards.map((c, i) => this.standardizeCard(c, i));
  }

  generateUniqueId(raw: RawTarotCard, index: number): string {
    const base = raw.name_short || `${raw.type}-${raw.value}`;
    return `${base}_${String(index).padStart(2, '0')}`;
  }
}

const standardizer = new TarotDataStandardizer();

// 生成本地 78 张卡牌的简易回退数据（名称/含义使用占位字符串，满足流程演示与开发自检）
function buildLocalFallback78(): RawTarotCard[] {
  const majors = [
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
  ];
  const suits: SuitType[] = ['cups', 'wands', 'swords', 'pentacles'];
  const ranks = [
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
  ];

  const majorCards: RawTarotCard[] = majors.map((v, i) => ({
    name: v.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()),
    name_short: `ar${String(i).padStart(2, '0')}`,
    type: 'major' as ArcanaType,
    value: v,
    suit: null,
    meaning_up: '',
    meaning_rev: '',
    desc: '',
  }));

  const minorCards: RawTarotCard[] = suits.flatMap((suit) =>
    ranks.map((r, i) => ({
      name: `${r} of ${suit}`,
      name_short: `${suit.slice(0, 1)}${r.slice(0, 1)}${String(i).padStart(2, '0')}`,
      type: 'minor' as ArcanaType,
      suit,
      value: r,
      meaning_up: '',
      meaning_rev: '',
      desc: '',
    })),
  );

  return [...majorCards, ...minorCards];
}

export interface GetFiveOptions {
  reversedProbability?: number;
}

// 新增：获取 78 张标准化 + 正/逆位后的完整卡组（带缓存与强制刷新）
export async function getAllStandardizedCardsCached(
  options: GetAllOptions = {},
): Promise<StandardCard[]> {
  const version = getAppVersion();
  const prob = options.reversedProbability ?? DEFAULT_REVERSED_PROB;
  const force = options.forceRefresh ?? detectForceRefresh();

  if (!force) {
    const cache = loadDeckFromCache();
    if (
      cache &&
      cache.version === version &&
      Array.isArray(cache.cards) &&
      cache.cards.length >= 78
    ) {
      return cache.cards;
    }
  }

  // 1) 拉取 78 张（API 优先，失败回退本地生成）
  let rawList: RawTarotCard[] | null = null;
  try {
    const data = await fetchJsonWithRetry('https://tarotapi.dev/api/v1/cards', {
      timeoutMs: options.timeoutMs ?? 6000,
      retries: options.retries ?? 2,
      baseDelayMs: options.baseDelayMs ?? 300,
    });
    if (Array.isArray(data)) {
      rawList = data as RawTarotCard[];
    } else if (data && typeof data === 'object' && Array.isArray((data as { cards?: unknown }).cards)) {
      rawList = (data as { cards: RawTarotCard[] }).cards;
    } else {
      throw new Error('Unexpected API response shape');
    }
  } catch (e) {
    if (import.meta.env.DEV) {
      // 开发期诊断：当 Hedge 日志阈值为 info 时，避免非关键路径的 warn 干扰用例，降级为 info；
      // 其余阈值保持 warn，便于定位后端/网络故障。
      try {
        const { logLevel } = readHedgeConfig(getEnv());
        const logger = logLevel === 'info' ? console.info : console.warn;
        // eslint-disable-next-line no-console
        logger('[tarotService] 远程 API 不可用，切换到本地回退数据。', e);
      } catch {
        // eslint-disable-next-line no-console
        console.warn('[tarotService] 远程 API 不可用，切换到本地回退数据。', e);
      }
    }
    rawList = buildLocalFallback78();
  }

  // 2) 标准化 → 3) 正逆位赋值
  const standardized = standardizer.standardizeCards(rawList!);
  const withOri = withReversal(standardized, { reversedProbability: prob }) as StandardCard[];

  // 4) 写入缓存
  saveDeckToCache({ version, timestamp: Date.now(), cards: withOri });

  return withOri;
}

// 新增：从完整卡组中随机抽取 5 张（不重复）
export function pickFiveFromDeck(
  cards: StandardCard[],
  rng: () => number = Math.random,
): StandardCard[] {
  const n = Math.min(5, cards.length);
  const indices = new Set<number>();
  while (indices.size < n) indices.add(Math.floor(rng() * cards.length));
  return Array.from(indices).map((i) => cards[i]);
}

// 主流程（向后兼容）：通过缓存获取全部卡，再随机抽取 5 张
export async function getFiveCards(options: GetFiveOptions = {}): Promise<StandardCard[]> {
  const all = await getAllStandardizedCardsCached({
    reversedProbability: options.reversedProbability,
    // 默认按规范：刷新页强制刷新；普通进入使用缓存
    forceRefresh: detectForceRefresh(),
  });
  return pickFiveFromDeck(all);
}

export function selectCardById(cards: StandardCard[], id: string): StandardCard | null {
  return cards.find((c) => c.id === id) || null;
}

// ==== 解读服务（Mock 优先，后续可接入真实 API） ====
/**
 * 解读入参
 * - question: 用户输入的问题文本（必填）
 * - cardId: 已选中的卡牌 ID（必填）
 * - reversed: 是否逆位（可选，缺省按卡片自身 isReversed 推断）
 */
export interface InterpretInput {
  question: string;
  cardId: string;
  reversed?: boolean;
}

// 方案C：Hedge 配置类型与解析（脚手架：仅解析，不接入业务逻辑）
export type HedgeLogLevel = 'debug' | 'info' | 'warn' | 'error';
export interface HedgeConfig {
  enabled: boolean; // 是否启用竞速
  delayMs: number; // 第二路起跑延迟（毫秒）
  abortLoser: boolean; // 是否在胜出方返回后中止败方
  logLevel: HedgeLogLevel; // 日志级别
}

export function readHedgeConfig(rawEnv?: Record<string, unknown>): HedgeConfig {
  // 允许在测试或调试时传入自定义 env；生产路径仍读取 import.meta.env
  const importMetaEnv = ((import.meta as unknown as { env?: unknown }).env ?? {}) as Record<string, unknown>;
  let env: Record<string, unknown>;
  if (rawEnv && typeof rawEnv === 'object') {
    env = { ...(rawEnv as Record<string, unknown>) };
  } else {
    env = {};
    try {
      const penv = (typeof process !== 'undefined' && (process as unknown as { env?: unknown }).env)
        ? (process as unknown as { env?: unknown }).env
        : undefined;
      if (penv && typeof penv === 'object') env = { ...env, ...(penv as Record<string, unknown>) };
    } catch { /* no-op */ void 0; }
    env = { ...env, ...importMetaEnv };
    try {
      const ov = (globalThis as unknown as { __TEST_IMPORT_META_ENV__?: unknown }).__TEST_IMPORT_META_ENV__;
      if (ov && typeof ov === 'object') env = { ...env, ...(ov as Record<string, unknown>) };
    } catch { /* no-op */ void 0; }
  }

  const toBool = (v: unknown, def: boolean): boolean => {
    const s = String(v ?? '').trim().toLowerCase();
    if (s === '1' || s === 'true') return true;
    if (s === '0' || s === 'false') return false;
    return def;
  };
  const toInt = (v: unknown, def: number): number => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : def;
  };
  const toLevel = (v: unknown, def: HedgeLogLevel): HedgeLogLevel => {
    const s = String(v ?? '').trim().toLowerCase();
    return (['debug', 'info', 'warn', 'error'] as const).includes(s as HedgeLogLevel)
      ? (s as HedgeLogLevel)
      : def;
  };

  const cfg: HedgeConfig = {
    enabled: toBool(env['VITE_AI_HEDGE_ENABLED'], false),
    delayMs: toInt(env['VITE_AI_HEDGE_DELAY_MS'], 250),
    abortLoser: toBool(env['VITE_AI_ABORT_LOSER'], true),
    logLevel: toLevel(env['VITE_AI_HEDGE_LOG_LEVEL'], 'warn'),
  };

  if (!rawEnv && import.meta.env.DEV) {
    const raw = {
      VITE_AI_HEDGE_ENABLED: env['VITE_AI_HEDGE_ENABLED'],
      VITE_AI_HEDGE_DELAY_MS: env['VITE_AI_HEDGE_DELAY_MS'],
      VITE_AI_ABORT_LOSER: env['VITE_AI_ABORT_LOSER'],
      VITE_AI_HEDGE_LOG_LEVEL: env['VITE_AI_HEDGE_LOG_LEVEL'],
    };
    const normalized = { ...cfg };
    // 开发期诊断日志门控：
    // 仅当 hedge.logLevel 为 'debug' 时输出诊断信息，避免在 warn/info 阈值误触发 info 日志，
    // 干扰测试用例“warn 阈值只输出 warn；info 阈值输出胜者 info”。
    if (cfg.logLevel === 'debug') {
      // eslint-disable-next-line no-console
      console.debug('[tarotService] Hedge scaffold config parsed', { raw, normalized });
    }
  }

  return cfg;
}

/**
 * 解读结果结构（供 UI 稳定消费）
 * - core: 核心解读文案
 * - actions: 建议行动（1-5 条）
 * - warnings: 需要注意（可选）
 * - cardId/reversed: 回执选择，便于埋点或后续流程
 */
export interface InterpretResult {
  cardId: string;
  reversed: boolean;
  core: string;
  actions: string[];
  warnings?: string[];
}

/**
 * 轻量 POST + JSON + 重试封装（仅用于 AI 接入）
 * - 复用 classifyError 的分类与指数退避策略，避免影响现有 fetchJsonWithRetry 签名
 */
async function postJsonWithRetry(
  url: string,
  body: unknown,
  {
    timeoutMs = 8000,
    retries = 1,
    baseDelayMs = 300,
    headers = {},
    signal,
  }: { timeoutMs?: number; retries?: number; baseDelayMs?: number; headers?: Record<string, string>; signal?: AbortSignal } = {},
): Promise<unknown> {
  let attempt = 0;
  const maxAttempts = retries + 1;
  while (attempt < maxAttempts) {
    try {
      // 使用带超时的 fetch。fetchWithTimeout 已处理非 2xx 抛错与 json 解析。
      return await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
        timeout: timeoutMs,
        signal,
      });
    } catch (e) {
      attempt += 1;
      const info = classifyError(e);
      if (import.meta.env.DEV) {
        // CANCELLED 场景属于“预期取消”，降级为 info；其余保留 warn 便于排障
        const isCancelled = info.type === 'CANCELLED';
        const logger = isCancelled ? console.info : console.warn;
        const provider = url.includes('/api/ai/gemini') ? 'gemini' : (url.includes('/api/ai/zhipu') ? 'zhipu' : 'direct');
        logger('[tarotService] AI 请求' + (isCancelled ? '已取消' : '失败'), { attempt, info, provider, status: info.status, url });
      }
      if (!info.retriable || attempt >= maxAttempts) throw e;
      const jitter = 0.2 + Math.random() * 0.4;
      const base = baseDelayMs * Math.pow(2, attempt - 1);
      const wait = Math.min(1500, Math.floor(base * jitter));
      await delay(wait);
    }
  }
  throw new Error('Unreachable AI retry loop');
}

/**
 * 规范化/裁剪 AI 返回，保障 UI 消费安全
 */
function normalizeInterpretResult(
  cardId: string,
  reversed: boolean,
  payload: unknown,
  options?: { debugLabel?: string },
): InterpretResult {
  // 解析轨迹（仅用于 DEV 诊断日志）
  let parsePath: 'direct-json' | 'fenced-json' | 'balanced-braces' | 'failed' = 'failed';

  // 当返回的是字符串时，常见格式有：
  // 1) 纯 JSON 文本
  // 2) Markdown 代码块包裹的 JSON（```json ... ``` 或 ``` ... ```）
  // 3) JSON 前后带有提示语/无关文字
  if (typeof payload === 'string') {
    const text = String(payload).trim();

    // 尝试 1：直接 JSON.parse（对应“裸 JSON”）
    try {
      payload = JSON.parse(text);
      parsePath = 'direct-json';
    } catch {
      // 尝试 2：识别 ```json ... ``` 或通用 ``` ... ``` 代码围栏
      const fencedJson = /```\s*json\s*\n([\s\S]*?)```/m.exec(text);
      const fencedAny = !fencedJson ? /```([\s\S]*?)```/m.exec(text) : null;
      const fencedContent = fencedJson ? fencedJson[1] : (fencedAny ? fencedAny[1] : undefined);

      if (fencedContent) {
        // 处理智能引号，避免被大模型替换导致解析失败
        const cleaned = fencedContent
          .replace(/[“”]/g, '"')
          .replace(/[‘’]/g, "'");
        try {
          payload = JSON.parse(cleaned);
          parsePath = 'fenced-json';
        } catch {
          // 若仍失败，继续走花括号平衡提取
        }
      }

      if (parsePath === 'failed') {
        // 尝试 3：在整段文本中提取第一个 { 到最后一个 } 的子串
        const raw = fencedContent ?? text;
        const start = raw.indexOf('{');
        const end = raw.lastIndexOf('}');
        if (start >= 0 && end > start) {
          const candidate = raw.slice(start, end + 1)
            .replace(/[“”]/g, '"')
            .replace(/[‘’]/g, "'");
          try {
            payload = JSON.parse(candidate);
            parsePath = 'balanced-braces';
          } catch {
            // 保持 failed
          }
        }
      }

      if (parsePath === 'failed') {
        // 解析失败，抛出错误给上层进行兜底
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.warn('[tarotService] AI 响应解析失败', {
            from: options?.debugLabel,
            preview: text.slice(0, 200),
          });
        }
        throw new Error('AI 响应解析失败');
      }
    }
  }

  // 走到这里 payload 应该是对象，进行结构归一化与类型守护
  if (!payload || typeof payload !== 'object') {
    throw new Error('AI 响应解析失败');
  }
  const obj = payload as Record<string, unknown>;
  const coreRaw = obj['core'];
  const actionsRaw = obj['actions'];
  const warningsRaw = obj['warnings'];

  const core = String(coreRaw ?? '').trim();

  // actions/warnings 既允许为字符串也允许为数组，做统一归一化
  const toStringArray = (v: unknown): string[] => {
    if (Array.isArray(v)) return v.map((x) => String(x ?? '').trim()).filter(Boolean);
    if (typeof v === 'string') return [v.trim()].filter(Boolean);
    return [];
  };

  const actions = toStringArray(actionsRaw).slice(0, 3);
  const warnings = toStringArray(warningsRaw).slice(0, 5);

  if (!core || actions.length === 0) {
    throw new Error('AI 响应字段不完整');
  }

  // DEV 结构化诊断日志：记录解析路径与片段
  if (import.meta.env.DEV) {
    try {
      // eslint-disable-next-line no-console
      console.info('[tarotService] AI 解析完成', {
        from: options?.debugLabel,
        parsePath,
        corePreview: core.slice(0, 60),
        actionsCount: actions.length,
        warningsCount: warnings.length,
      });
    } catch {
      // no-op: 仅用于在 DEV 下输出诊断信息，避免影响正常流程
      void 0;
    }
  }

  return { cardId, reversed, core, actions, warnings: warnings.length ? warnings : undefined };
}

/**
 * 组装 Prompt v1.2（在 v1.1 基础上增加“字数与结构边界”）
 * - 输出要求：仅返回 JSON 对象，形如 { core, actions, warnings }
 * - 字数要求：
 *   - core（塔罗洞察）：300-350 字以内；强调关键矛盾与可落地方向，避免空话与重复
 *   - actions（行动建议）：2-3 条，总字数 150-200 字以内；每条约 50-65 字；若超过 3 条请仅保留重要的 2-3 条，并压缩以满足总字数。需包含可执行动作与可验证要素（时间窗/度量/前置条件）。
 *   - warnings（现实考量）：固定 3 条，分别对应「边界与责任 / 认知盲点 / 时间窗与复盘」，每条 20-40 字
 */
function buildPromptV12(params: {
  question: string;
  card: StandardCard | null;
  reversed: boolean;
}): string {
  const { question, card, reversed } = params;
  const zhName = card?.name || '所抽到的牌';

  // 牌面证据锚点：类型/花色/数值/正逆位（与 v1.1 保持一致，避免引导冗长输出）
  const evidence: string[] = [];
  if (card?.type) evidence.push(card.type === 'major' ? '大阿尔卡那' : '小阿尔卡那');
  if (card?.suit) evidence.push(`花色:${card.suit}`);
  if (card?.value) evidence.push(`牌值:${card.value}`);
  evidence.push(reversed ? '状态:逆位' : '状态:正位');
  const evidenceLine = evidence.join(' / ');

  return [
    '你是一名严谨的塔罗解读师。仅基于“牌面证据与用户问题”给出专业、具体、可执行的中文解读。',
    '输出结构固定为 JSON 对象：{"core": string, "actions": string[], "warnings": string[]}',
    '禁止输出多余文字、提示语、说明、Markdown 代码块或前后缀。',
    '',
    '字数边界：',
    '1) core（塔罗洞察）：请控制在 300-350 字以内；紧扣当下情势、关键矛盾与可落地方向，避免空话与重复。',
    '2) actions（行动建议）：2-3 条，总字数 150-200 字以内；每条约 50-65 字，需包含可执行动作与可验证要素（时间窗/度量/前置条件）。',
    '3) warnings（现实考量）：固定 3 条，主题依次为「边界与责任」「认知盲点」「时间窗与复盘」，每条 20-40 字，避免危言耸听。',
    '',
    '风格与约束：紧扣牌面证据与用户问题；不凭空扩展；克制、务实，避免夸张或迷信表达。',
    '',
    `牌面证据: ${evidenceLine}`,
    `牌名: ${zhName}`,
    `用户问题: ${question}`,
    '',
    '请只返回 JSON 对象。',
  ].join('\n');
}

// 本地 Mock 回退生成：保证结构与前缀满足 UI 与测试消费
function buildLocalInterpretFallback(input: InterpretInput, card: StandardCard | null): InterpretResult {
  const name = card?.name || '所抽到的牌';
  const reversed = !!(input.reversed ?? card?.isReversed ?? false);
  const core = `塔罗洞察：围绕「${name}」与您的问题「${input.question}」，请聚焦关键矛盾与可落地方向。`;
  const actions = [
    '短期行动：明确一个可验证的目标与时间窗，拆解为两到三步的小任务并推进。',
    '中期行动：识别主要限制与关键资源，建立每周复盘与调整机制。',
  ];
  const warnings = [
    '边界与责任：区分可控与不可控，聚焦能改变的部分。',
    '认知盲点：持续检视假设，避免自我确认偏误。',
    '时间窗与复盘：设置节点验收，及时调整节奏。',
  ];
  return { cardId: input.cardId, reversed, core, actions, warnings };
}

// 导出主解读函数：支持顺序回退与 Hedge 并发竞速
export async function interpretQuestion(
  input: InterpretInput,
  opts: { totalTimeoutMs?: number } = {},
): Promise<InterpretResult> {
  const env = getEnv();

  // 初始开关：是否启用 AI 解读；是否允许回退到本地 Mock
  const aiEnabled = String(env?.VITE_ENABLE_AI_READING || 'false') === 'true';
  const useMock = String(env?.VITE_USE_MOCK || 'true') === 'true';

  // 若未启用 AI 或强制使用本地 Mock，则直接返回本地回退
  if (!aiEnabled && useMock) {
    let card: StandardCard | null = null;
    try {
      const all = await getAllStandardizedCardsCached({ forceRefresh: false });
      card = all.find((c) => c.id === input.cardId) ?? null;
    } catch { void 0; }
    return buildLocalInterpretFallback(input, card);
  }

  // 读取 Hedge 配置与总超时
  const hedge = readHedgeConfig(env);
  const totalTimeoutMs = (() => {
    const fromOpts = opts?.totalTimeoutMs;
    const fromChain = parseInt(String(env?.VITE_AI_CHAIN_DEADLINE_MS || '0'), 10);
    const fromSimple = parseInt(String(env?.VITE_AI_TIMEOUT_MS || '0'), 10);
    const pick = (v?: number) => (Number.isFinite(v as number) && (v as number) > 0 ? (v as number) : 0);
    const v = pick(fromOpts) || pick(fromChain) || pick(fromSimple);
    return v > 0 ? v : 15000; // 安全默认 15s，避免误触发总超时
  })();

  // 运行时覆盖：允许在测试中屏蔽某路提供商，避免 .env.local 干扰
  const rtAllowGemini = (globalThis as unknown as HedgeGlobals).__AI_FORCE_GEMINI__;
  const rtAllowZhipu = (globalThis as unknown as HedgeGlobals).__AI_FORCE_ZHIPU__;
  const disabledZhipu = String(env?.VITE_DISABLE_ZHIPU || 'false') === 'true';
  const allowGemini = rtAllowGemini === undefined ? true : !!rtAllowGemini;
  const allowZhipu = rtAllowZhipu === undefined ? !disabledZhipu : (!!rtAllowZhipu && !disabledZhipu);

  // Hedge 可观测性：门控与分支信息暴露到全局，供测试采集
  const gates = { enabled: hedge.enabled, delayMs: hedge.delayMs, abortLoser: hedge.abortLoser, logLevel: hedge.logLevel, allowGemini, allowZhipu };
  const gHedge = globalThis as unknown as HedgeGlobals;
  gHedge.__HEDGE_GATES__ = gates;
  gHedge.__HEDGE_BRANCH__ = hedge.enabled ? 'hedge' : 'serial';
  // Hedge 事件发布器：按日志阈值进行门控，保障测试预期
  // - 阈值等级含义：
  //   debug → 允许 {debug, info, warn, error}
  //   info  → 允许 {info,  warn, error}
  //   warn  → 允许 {       warn, error}
  //   error → 允许 {            error}
  const publishHedgeEvent = (level: string, ...args: unknown[]) => {
    // 事件级别门控（仅在允许级别时才发布与捕获）
    const allowLevels: Record<HedgeLogLevel, ReadonlyArray<string>> = {
      debug: ['debug', 'info', 'warn', 'error'],
      info: ['info', 'warn', 'error'],
      warn: ['warn', 'error'],
      error: ['error'],
    };
    const allowed = allowLevels[hedge.logLevel].includes(level);
    if (!allowed) return;
    try {
      const gg = globalThis as unknown as HedgeGlobals & { __HEDGE_LAST_EVENT__?: { level: string; args: unknown[] } };
      gg.__HEDGE_LAST_EVENT__ = { level, args };
      const cap = gg.__HEDGE_LOG_CAPTURE__;
      if (typeof cap === 'function') cap(level, ...args);
      // 仅当允许发布 info 时，才记录胜者信息到全局（供测试诊断）
      if (level === 'info' && args[0] === 'winner') {
        gg.__HEDGE_WINNER__ = args[1] as unknown;
      }
    } catch { void 0; }
  };
  // 提前发布 gates 事件，便于调试
  publishHedgeEvent('debug', 'gates', gates);

  // 简单日志函数，受 Hedge 日志级别门控
  const logInfo = (...args: unknown[]) => { if (['debug', 'info'].includes(hedge.logLevel)) { try { console.info('[tarotService] interpret', ...args); } catch { void 0; } } };
  const logWarn = (...args: unknown[]) => { if (['debug', 'info', 'warn'].includes(hedge.logLevel)) { try { console.warn('[tarotService] interpret', ...args); } catch { void 0; } } };

  // 非 Hedge：按顺序回退（Gemini -> Zhipu -> Mock）
  if (!hedge.enabled) {
    // 发布顺序路径进入事件
    publishHedgeEvent('debug', 'serial_enter');
    // 先 Gemini
    if (allowGemini) {
      // 发布尝试调用 Gemini 的事件
      publishHedgeEvent('debug', 'serial_attempt', 'gemini');
      try {
        const r = await tryGeminiInterpret(input);
        // 在非并发路径也补充 winner 事件（便于统一测试采集）
        publishHedgeEvent('info', 'winner', 'gemini');
        publishHedgeEvent('debug', 'serial_winner', 'gemini');
        return r;
      } catch (err) {
        // 发布 Gemini 失败事件（便于定位）
        publishHedgeEvent('warn', 'serial_fail', 'gemini', classifyError(err));
      }
    }
    // 再 Zhipu
    if (allowZhipu) {
      // 发布尝试调用 Zhipu 的事件
      publishHedgeEvent('debug', 'serial_attempt', 'zhipu');
      try {
        const r = await tryZhipuInterpret(input);
        publishHedgeEvent('info', 'winner', 'zhipu');
        publishHedgeEvent('debug', 'serial_winner', 'zhipu');
        return r;
      } catch (err) {
        // 发布 Zhipu 失败事件（便于定位）
        publishHedgeEvent('warn', 'serial_fail', 'zhipu', classifyError(err));
      }
    }
    // 两者均失败 → 回退 Mock（若允许）
    if (useMock) {
      let card: StandardCard | null = null;
      try {
        const all = await getAllStandardizedCardsCached({ forceRefresh: false });
        card = all.find((c) => c.id === input.cardId) ?? null;
      } catch {
        // no-op: 仅用于回退 mock 时允许卡牌查询失败而不中断流程
        void 0;
      }
      publishHedgeEvent('warn', 'serial_fallback', 'mock');
      logWarn('all providers failed → fallback to mock');
      return buildLocalInterpretFallback(input, card);
    }
    publishHedgeEvent('error', 'serial_all_failed');
    throw new Error('AI 解读失败且 Mock 被禁用');
  }

  // Hedge 并发竞速
  const gemCtrl = new AbortController();
  const zhiCtrl = new AbortController();
  let startedGem = false;
  let startedZhi = false;

  const wrapGem = async (): Promise<{ provider: 'gemini'; res: InterpretResult }> => {
    startedGem = true;
    const res = await tryGeminiInterpret(input, { signal: gemCtrl.signal });
    return { provider: 'gemini', res };
  };

  const wrapZhi = (): Promise<{ provider: 'zhipu'; res: InterpretResult }> => {
    return new Promise((resolve, reject) => {
      const start = () => {
        if (zhiCtrl.signal.aborted) {
          return reject(new Error('aborted-before-start'));
        }
        startedZhi = true;
        tryZhipuInterpret(input, { signal: zhiCtrl.signal })
          .then((res) => resolve({ provider: 'zhipu', res }))
          .catch(reject);
      };
      if (hedge.delayMs > 0) setTimeout(start, hedge.delayMs); else start();
    });
  };

  const promises: Promise<{ provider: 'gemini' | 'zhipu'; res: InterpretResult }>[] = [];
  if (allowGemini) promises.push(wrapGem());
  if (allowZhipu) promises.push(wrapZhi());

  if (promises.length === 0) {
    // 无可用提供商 → 直接回退
    let card: StandardCard | null = null;
    try { const all = await getAllStandardizedCardsCached({ forceRefresh: false }); card = all.find((c) => c.id === input.cardId) ?? null; } catch { /* no-op */ void 0; }
    return buildLocalInterpretFallback(input, card);
  }

  // 总超时：达到边界立即中止两路并回退
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let timedOut = false;
  if (totalTimeoutMs > 0) {
    timeoutId = setTimeout(() => {
      timedOut = true;
      try { gemCtrl.abort('total-timeout-or-all-failed'); } catch { /* no-op */ void 0; }
      try { zhiCtrl.abort('total-timeout-or-all-failed'); } catch { /* no-op */ void 0; }
    }, totalTimeoutMs);
  }

  try {
    const winner = await promiseAnyFulfilled(promises);
    // 选出胜者后：根据配置中止败方
    if (timeoutId) { try { clearTimeout(timeoutId); } catch { /* no-op */ void 0; } }
    if (hedge.abortLoser) {
      if (winner.provider === 'gemini') {
        try { zhiCtrl.abort('loser-abort'); } catch { /* no-op */ void 0; }
        logInfo('winner=gemini, abort loser');
      } else {
        try { gemCtrl.abort('loser-abort'); } catch { /* no-op */ void 0; }
        logInfo('winner=zhipu, abort loser');
      }
    }
    // 发布 winner 事件供测试采集
    publishHedgeEvent('info', 'winner', winner.provider);
    return winner.res;
  } catch (err) {
    if (timeoutId) { try { clearTimeout(timeoutId); } catch { /* no-op */ void 0; } }
    // 若是总超时，或两路均失败，则回退到 Mock（若允许）
    if (timedOut) {
      logWarn('total timeout → fallback mock');
    } else {
      logWarn('both providers failed → fallback mock', { startedGem, startedZhi });
    }
    if (useMock) {
      let card: StandardCard | null = null;
      try { const all = await getAllStandardizedCardsCached({ forceRefresh: false }); card = all.find((c) => c.id === input.cardId) ?? null; } catch { /* no-op */ void 0; }
      return buildLocalInterpretFallback(input, card);
    }
    throw err;
  }
}

// ...
// 统一获取 env（支持测试用全局覆盖 __TEST_IMPORT_META_ENV__），以避免不同模块 import.meta.env 对象不共享导致的注入偏差。
function getEnv(): Record<string, unknown> {
  try {
    // 1) 基础：Vite 的 import.meta.env（浏览器/打包环境）
    const rawImportEnv = ((import.meta as unknown as { env?: unknown }).env) ?? {};
    let merged: Record<string, unknown> = { ...(rawImportEnv as Record<string, unknown>) };

    // 2) 兼容：Node 测试环境（Vitest）下的 process.env
    //    - Vitest 运行于 Node，上下文间 globalThis 可能不同，但 process.env 是进程级共享
    let penv: unknown = undefined;
    try {
      penv = (typeof process !== 'undefined' && (process as unknown as { env?: unknown })?.env)
        ? (process as unknown as { env?: unknown }).env
        : undefined;
      if (penv && typeof penv === 'object') {
        merged = { ...merged, ...(penv as Record<string, unknown>) };
      }
    } catch { /* no-op */ void 0; }

    // 3) 测试专用最高优先级覆盖：__TEST_IMPORT_META_ENV__
    let ov: unknown = undefined;
    try {
      ov = (globalThis as unknown as { __TEST_IMPORT_META_ENV__?: unknown }).__TEST_IMPORT_META_ENV__;
      if (ov && typeof ov === 'object') {
        merged = { ...merged, ...(ov as Record<string, unknown>) };
      }
    } catch { /* no-op */ void 0; }

    // 4) 仅测试诊断：镜像关键字段，便于断言覆盖是否生效
    try {
      const penvObj = penv && typeof penv === 'object' ? (penv as Record<string, unknown>) : undefined;
      const penvSnap = penvObj ? {
        VITE_ENABLE_AI_READING: penvObj['VITE_ENABLE_AI_READING'],
        VITE_AI_HEDGE_ENABLED: penvObj['VITE_AI_HEDGE_ENABLED'],
        VITE_AI_HEDGE_LOG_LEVEL: penvObj['VITE_AI_HEDGE_LOG_LEVEL'],
        VITE_AI_HEDGE_DELAY_MS: penvObj['VITE_AI_HEDGE_DELAY_MS'],
        VITE_AI_ABORT_LOSER: penvObj['VITE_AI_ABORT_LOSER'],
      } : undefined;
      const mergedSnap = {
        VITE_ENABLE_AI_READING: (merged as Record<string, unknown>)['VITE_ENABLE_AI_READING'],
        VITE_AI_HEDGE_ENABLED: (merged as Record<string, unknown>)['VITE_AI_HEDGE_ENABLED'],
        VITE_AI_HEDGE_LOG_LEVEL: (merged as Record<string, unknown>)['VITE_AI_HEDGE_LOG_LEVEL'],
        VITE_AI_HEDGE_DELAY_MS: (merged as Record<string, unknown>)['VITE_AI_HEDGE_DELAY_MS'],
        VITE_AI_ABORT_LOSER: (merged as Record<string, unknown>)['VITE_AI_ABORT_LOSER'],
      };
      (globalThis as unknown as { __DBG_GETENV__?: unknown }).__DBG_GETENV__ = {
        ovKeys: ov && typeof ov === 'object' ? Object.keys(ov as Record<string, unknown>) : [],
        penv: penvSnap,
        merged: mergedSnap,
      };
    } catch { /* no-op */ void 0; }

    return merged;
  } catch {
    return {};
  }
}

/**
 * 调用 Gemini API（v1beta generateContent）
 * - 默认模型可由 VITE_GEMINI_MODEL 指定（如 gemini-1.5-pro），否则给出安全默认
 * - 成功时返回规范化后的 InterpretResult；失败时由上层回退到 mock
 */
async function tryGeminiInterpret(
  input: InterpretInput,
  opts: { signal?: AbortSignal } = {},
): Promise<InterpretResult> {
  // 读取运行时环境（兼容 Vite import.meta.env / Node process.env / 测试注入）
  const env = getEnv();

  // 统一启用总开关（默认关闭）
  const enabled = String(env['VITE_ENABLE_AI_READING'] ?? 'false') === 'true';

  // 代理/直连开关：可通过 VITE_AI_DEV_PROXY（dev 时）或 __AI_FORCE_PROXY__（测试）影响
  const forceProxy = !!((globalThis as unknown as { __AI_FORCE_PROXY__?: unknown }).__AI_FORCE_PROXY__);
  const rawProxy = env['VITE_AI_DEV_PROXY'];
  const proxyOn = forceProxy || ['1', 'true', 'yes', 'on'].includes(String(rawProxy ?? '').toLowerCase());

  // 默认模型：优先取 VITE_GEMINI_MODEL；未设置时使用 gemini-1.5-flash（避免未设置时落到不兼容模型导致 404）
  const model = String(env['VITE_GEMINI_MODEL'] ?? 'gemini-2.0-flash').trim(); // 默认模型改为 2.0-flash，避免 1.5 系列的 generateContent 404，优先保障“免费可用”与功能跑通
  
  // 直连模式要求提供 API Key；代理模式由 dev server 注入，不在浏览器暴露
  const apiKey = String(env['VITE_GEMINI_API_KEY'] ?? '').trim();
  if (!enabled || (!proxyOn && !apiKey)) {
    throw new Error('AI 未启用或缺少密钥');
  }

  // 获取选中卡片的标准化元信息（用于提示词构建）
  let card: StandardCard | null = null;
  try {
    const all = await getAllStandardizedCardsCached({ forceRefresh: false });
    card = all.find((c) => c.id === input.cardId) ?? null;
  } catch {
    card = null;
  }

  // 判定正逆位：以调用入参为优先，其次卡片自身标识，默认正位
  const reversed = !!(input.reversed ?? card?.isReversed ?? false);

  // 构建提示词（面向 JSON 输出，参见 buildPromptV12 的约束说明）
  const prompt = buildPromptV12({ question: input.question, card, reversed });

  // 构造 Google Generative Language API v1beta generateContent 请求体
  const body = {
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ],
  };

  // 读取重试次数（测试可设为 0 以加速失败路径）
  const gemRetries = parseInt(String(env['VITE_GEMINI_RETRIES'] ?? '1'), 10);

  // 发送请求：代理优先（避免在浏览器暴露密钥）；如未启用代理则直连上游
  let json: unknown;
  if (proxyOn) {
    // 通过 Vite dev server 的 /api/ai/gemini/generate 代理上游
    const callUrl = '/api/ai/gemini/generate';
    if (import.meta.env.DEV) {
      try {
        const g = globalThis as unknown as { __AI_CALL_SEQ__?: Array<{ provider: string; url: string }> };
        g.__AI_CALL_SEQ__ = g.__AI_CALL_SEQ__ ?? [];
        g.__AI_CALL_SEQ__.push({ provider: 'gemini', url: callUrl });
      } catch { /* no-op */ void 0; }
    }
    json = await postJsonWithRetry(callUrl, body, {
      timeoutMs: 10000,
      retries: gemRetries,
      baseDelayMs: 300,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      signal: opts.signal,
    });
  } else {
    // 直连 Google API：将模型与密钥写入查询串
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    if (import.meta.env.DEV) {
      try {
        const g = globalThis as unknown as { __AI_CALL_SEQ__?: Array<{ provider: string; url: string }> };
        g.__AI_CALL_SEQ__ = g.__AI_CALL_SEQ__ ?? [];
        g.__AI_CALL_SEQ__.push({ provider: 'gemini', url });
      } catch { /* no-op */ void 0; }
    }
    json = await postJsonWithRetry(url, body, {
      timeoutMs: 10000,
      retries: gemRetries,
      baseDelayMs: 300,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      signal: opts.signal,
    });
  }

  // 提取文本结果：规范接口 candidates[0].content.parts[*].text
  const pickText = (payload: unknown): string => {
    try {
      const r = payload as Record<string, unknown>;
      const candidates = r['candidates'];
      if (Array.isArray(candidates)) {
        const first = candidates[0];
        if (first && typeof first === 'object') {
          const content = (first as Record<string, unknown>)['content'];
          const parts = content && typeof content === 'object' ? (content as Record<string, unknown>)['parts'] : undefined;
          if (Array.isArray(parts)) {
            const texts = parts
              .map((p) => (p && typeof p === 'object' ? String((p as Record<string, unknown>)['text'] ?? '') : ''))
              .filter(Boolean);
            if (texts.length) return texts.join('\n');
          }
        }
      }
      const firstCand = Array.isArray(candidates) ? (candidates[0] as Record<string, unknown>) : undefined;
      const direct = (firstCand ? firstCand['output_text'] : undefined) ?? r['output_text'];
      if (direct) return String(direct);
    } catch { /* no-op */ void 0; }
    return '';
  };

  const text = pickText(json);
  if (!text) {
    throw new Error('AI 响应为空或不含文本');
  }

  // 交给规范化器解析（支持 JSON 字符串 / 代码围栏 / 文本包裹 JSON 等格式），保障 UI 消费安全
  return normalizeInterpretResult(input.cardId, reversed, text, { debugLabel: proxyOn ? 'gemini:proxy' : 'gemini:direct' });
}

/**
 * 调用 Zhipu API (GLM 系列模型)
 * - 代理模式：通过 /api/ai/zhipu 走 dev server 代理，不在浏览器暴露密钥
 * - 直连模式：直连 open.bigmodel.cn，携带 Authorization: Bearer <key>
 * - 成功时返回规范化后的 InterpretResult；失败时由上层回退到 mock
 */
async function tryZhipuInterpret(
  input: InterpretInput,
  opts: { signal?: AbortSignal } = {},
): Promise<InterpretResult> {
  // 读取运行时环境（兼容 Vite import.meta.env / Node process.env / 测试注入）
  const env = getEnv();

  // 统一启用总开关（默认关闭）
  const enabled = String(env['VITE_ENABLE_AI_READING'] ?? 'false') === 'true';

  // Zhipu 特定禁用开关：优先检查禁用标志
  const disabled = String(env['VITE_DISABLE_ZHIPU'] ?? 'false') === 'true';
  if (!enabled || disabled) {
    throw new Error('Zhipu AI 未启用或被禁用');
  }

  // 代理/直连开关：可通过 VITE_AI_DEV_PROXY（dev 时）或 __AI_FORCE_PROXY__（测试）影响
  const forceProxy = !!((globalThis as unknown as { __AI_FORCE_PROXY__?: unknown }).__AI_FORCE_PROXY__);
  const rawProxy = env['VITE_AI_DEV_PROXY'];
  const proxyOn = forceProxy || ['1', 'true', 'yes', 'on'].includes(String(rawProxy ?? '').toLowerCase());

  // 默认模型：使用 GLM-4 作为安全默认值（Zhipu 主力模型）
  const model = String(env['VITE_ZHIPU_MODEL'] ?? 'glm-4').trim();

  // 直连模式要求提供 API Key；代理模式由 dev server 注入，不在浏览器暴露
  const apiKey = String(env['VITE_ZHIPU_API_KEY'] ?? '').trim();
  if (!proxyOn && !apiKey) {
    throw new Error('Zhipu 直连模式缺少 API 密钥');
  }

  // 获取选中卡片的标准化元信息（用于提示词构建）
  let card: StandardCard | null = null;
  try {
    const all = await getAllStandardizedCardsCached({ forceRefresh: false });
    card = all.find((c) => c.id === input.cardId) ?? null;
  } catch {
    card = null;
  }

  // 判定正逆位：以调用入参为优先，其次卡片自身标识，默认正位
  const reversed = !!(input.reversed ?? card?.isReversed ?? false);

  // 构建提示词（面向 JSON 输出，复用 Gemini 的提示词策略）
  const prompt = buildPromptV12({ question: input.question, card, reversed });

  // 读取 Zhipu 模型参数（使用环境变量或安全默认值）
  const temperature = parseFloat(String(env['VITE_ZHIPU_TEMPERATURE'] ?? '0.7'));
  const topP = parseFloat(String(env['VITE_ZHIPU_TOP_P'] ?? '0.9'));
  const maxTokens = parseInt(String(env['VITE_ZHIPU_MAX_TOKENS'] ?? '1024'), 10);
  const frequencyPenalty = parseFloat(String(env['VITE_ZHIPU_FREQ_PENALTY'] ?? '0.0'));

  // 构造 Zhipu API 请求体（ChatCompletion 格式）
  const body = {
    model,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature: Math.max(0, Math.min(2, temperature)), // 限制在合理范围
    top_p: Math.max(0, Math.min(1, topP)),
    max_tokens: Math.max(1, maxTokens),
    frequency_penalty: Math.max(-2, Math.min(2, frequencyPenalty)),
  };

  // 发送请求：代理优先（避免在浏览器暴露密钥）；如未启用代理则直连上游
  let json: unknown;
  if (proxyOn) {
    // 通过 Vite dev server 的 /api/ai/zhipu 代理上游
    const callUrl = '/api/ai/zhipu';
    if (import.meta.env.DEV) {
      try {
        const g = globalThis as unknown as { __AI_CALL_SEQ__?: Array<{ provider: string; url: string }> };
        g.__AI_CALL_SEQ__ = g.__AI_CALL_SEQ__ ?? [];
        g.__AI_CALL_SEQ__.push({ provider: 'zhipu', url: callUrl });
      } catch { /* no-op */ void 0; }
    }
    json = await postJsonWithRetry(callUrl, body, {
      timeoutMs: 10000,
      retries: parseInt(String(env['VITE_ZHIPU_RETRIES'] ?? '1'), 10),
      baseDelayMs: 300,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      signal: opts.signal,
    });
  } else {
    // 直连 Zhipu API：携带 Authorization Bearer token
    const url = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
    if (import.meta.env.DEV) {
      try {
        const g = globalThis as unknown as { __AI_CALL_SEQ__?: Array<{ provider: string; url: string }> };
        g.__AI_CALL_SEQ__ = g.__AI_CALL_SEQ__ ?? [];
        g.__AI_CALL_SEQ__.push({ provider: 'zhipu', url });
      } catch { /* no-op */ void 0; }
    }
    json = await postJsonWithRetry(url, body, {
      timeoutMs: 10000,
      retries: parseInt(String(env['VITE_ZHIPU_RETRIES'] ?? '1'), 10),
      baseDelayMs: 300,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      signal: opts.signal,
    });
  }

  // 提取文本结果：按 Zhipu ChatCompletion 接口规范 choices[0].message.content
  const pickText = (payload: unknown): string => {
    try {
      // 新增：当载荷是字符串时直接返回，交由规范化器解析
      if (typeof payload === 'string') {
        const s = payload.trim();
        if (s) return s;
      }
      const r = payload as Record<string, unknown>;
      const choices = r['choices'];
      if (Array.isArray(choices)) {
        const first = choices[0];
        if (first && typeof first === 'object') {
          const msg = (first as Record<string, unknown>)['message'];
          if (msg && typeof msg === 'object') {
            const content = (msg as Record<string, unknown>)['content'];
            if (typeof content === 'string' && content.trim()) {
              return content.trim();
            }
          }
        }
      }
      // 兼容其他可能的响应格式
      const output = r['output'];
      if (output && typeof output === 'object') {
        const t = (output as Record<string, unknown>)['text'];
        if (typeof t === 'string' && t.trim()) return t.trim();
      }
      const directText = r['text'];
      if (typeof directText === 'string' && directText.trim()) return directText.trim();
      const directContent = r['content'];
      if (typeof directContent === 'string' && directContent.trim()) return directContent.trim();
    } catch { /* no-op */ void 0; }
    return '';
  };

  const text = pickText(json);
  if (!text) {
    throw new Error('Zhipu AI 响应为空或不含文本');
  }

  // 交给规范化器解析（支持 JSON 字符串 / 代码围栏 / 文本包裹 JSON 等格式），保障 UI 消费安全
  return normalizeInterpretResult(input.cardId, reversed, text, { debugLabel: proxyOn ? 'zhipu:proxy' : 'zhipu:direct' });
}
