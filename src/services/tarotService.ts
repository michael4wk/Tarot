import { getCardImagePath, type ArcanaType, type SuitType } from '@/utils/images';
import { withReversal, DEFAULT_REVERSED_PROB } from '@/utils/reversal';

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
    const legacy: any = (performance as any).navigation;
    if (legacy && legacy.type === 1) return true; // 1 === TYPE_RELOAD（已废弃 API 的兼容）
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
  type: 'TIMEOUT' | 'NETWORK' | 'HTTP';
  status?: number;
  retriable: boolean;
  message: string;
}

// 将 Error 归一化为错误信息，便于判断是否可重试
function classifyError(err: unknown): ServiceErrorInfo {
  // fetch 超时通常由 AbortError 标识
  if (err && typeof err === 'object' && (err as any).name === 'AbortError') {
    return { type: 'TIMEOUT', retriable: true, message: '请求超时' };
  }
  // 我们在下方抛出的错误会附带 status 字段
  const status = (err as any)?.status as number | undefined;
  if (typeof status === 'number') {
    const retriable = status >= 500 || status === 429;
    return { type: 'HTTP', status, retriable, message: `HTTP ${status}` };
  }
  // 其余情况视为网络错误（离线/跨域/被阻止等）
  return { type: 'NETWORK', retriable: true, message: (err as any)?.message || '网络错误' };
}

// 轻量 sleep，用于指数退避
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 带超时的 fetch：保持轻薄，只负责超时与 HTTP 状态判断
async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit & { timeout?: number; signal?: AbortSignal } = {},
): Promise<any> {
  const { timeout = 8000, signal, ...rest } = init;
  // 当外部传入 signal 时，合并与本地超时控制器：任一触发都应中止
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(input, { ...rest, signal: controller.signal });
    if (!res.ok) {
      // 在错误上附带 status，便于上层分类
      throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
    }
    return await res.json();
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
): Promise<any> {
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
    rawList = Array.isArray(data) ? (data as RawTarotCard[]) : (data.cards as RawTarotCard[]);
  } catch (e) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn('[tarotService] 远程 API 不可用，切换到本地回退数据。', e);
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

/**
 * 从 import.meta.env 读取并解析 Hedge 配置。
 * 注意：
 * - 仅用于脚手架，默认关闭；
 * - 避免抛错影响现有行为，非法值一律回落到默认；
 * - 在开发态 DEV 输出一次性 warn，帮助定位配置问题。
 * - 变量优先级（后者覆盖前者）：process.env < import.meta.env < __TEST_IMPORT_META_ENV__ < rawEnv
 */
export function readHedgeConfig(rawEnv?: Record<string, unknown>): HedgeConfig {
  // 允许在测试或调试时传入自定义 env；生产路径仍读取 import.meta.env
  const importMetaEnv: any = ((import.meta as any).env ?? {});
  // 以 process.env 为最低优先级基底
  let env: any = {};
  try {
    const penv: any = (typeof process !== 'undefined' && (process as any)?.env) ? (process as any).env : undefined;
    if (penv && typeof penv === 'object') env = { ...env, ...penv };
  } catch {}
  // 然后用 import.meta.env 覆盖之
  env = { ...env, ...importMetaEnv };
  // 再合并全局测试覆盖，优先于前两者
  try {
    const ov: any = (globalThis as any).__TEST_IMPORT_META_ENV__;
    if (ov && typeof ov === 'object') env = { ...env, ...ov };
  } catch {}
  // 若调用方显式传入 rawEnv，则视为最高优先级（用于单测场景）
  if (rawEnv && typeof rawEnv === 'object') env = { ...env, ...(rawEnv as any) };

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
    enabled: toBool((env as any).VITE_AI_HEDGE_ENABLED, false),
    delayMs: toInt((env as any).VITE_AI_HEDGE_DELAY_MS, 250),
    abortLoser: toBool((env as any).VITE_AI_ABORT_LOSER, true),
    logLevel: toLevel((env as any).VITE_AI_HEDGE_LOG_LEVEL, 'warn'),
  };

  if (!rawEnv && import.meta.env.DEV) {
    const raw = {
      VITE_AI_HEDGE_ENABLED: (env as any).VITE_AI_HEDGE_ENABLED,
      VITE_AI_HEDGE_DELAY_MS: (env as any).VITE_AI_HEDGE_DELAY_MS,
      VITE_AI_ABORT_LOSER: (env as any).VITE_AI_ABORT_LOSER,
      VITE_AI_HEDGE_LOG_LEVEL: (env as any).VITE_AI_HEDGE_LOG_LEVEL,
    };
    const normalized = { ...cfg };
    // eslint-disable-next-line no-console
    console.info('[tarotService] Hedge scaffold config parsed', { raw, normalized });
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
  body: any,
  {
    timeoutMs = 8000,
    retries = 1,
    baseDelayMs = 300,
    headers = {},
    signal,
  }: { timeoutMs?: number; retries?: number; baseDelayMs?: number; headers?: Record<string, string>; signal?: AbortSignal } = {},
): Promise<any> {
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
      } as any);
    } catch (e) {
      attempt += 1;
      const info = classifyError(e);
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn('[tarotService] AI 请求失败', { attempt, info });
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
  payload: any,
): InterpretResult {
  // 可能包含 Markdown 包裹或多余前后缀的 JSON 文本，先尽力清洗
  if (typeof payload === 'string') {
    const text = payload.trim();
    const fenced = /```(?:json)?([\s\S]*?)```/m.exec(text);
    const raw = fenced ? fenced[1] : text;
    const objText = (() => {
      // 尝试截取第一个 { 到最后一个 } 之间的内容
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      if (start >= 0 && end > start) return raw.slice(start, end + 1);
      return raw;
    })();
    try {
      payload = JSON.parse(objText);
    } catch {
      // JSON 解析失败，抛出让上层回退 mock
      throw new Error('AI 响应解析失败');
    }
  }

  const core = String(payload?.core || '').trim();
  const actionsArr = Array.isArray(payload?.actions) ? payload.actions : [];
  const warningsArr = Array.isArray(payload?.warnings) ? payload.warnings : [];

  const actions = actionsArr
    .map((v: unknown) => String((v as any) || '').trim())
    .filter(Boolean)
    .slice(0, 3);
  const warnings = warningsArr
    .map((v: unknown) => String((v as any) || '').trim())
    .filter(Boolean)
    .slice(0, 5);

  if (!core || actions.length === 0) {
    throw new Error('AI 响应字段不完整');
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

// 统一获取 env（支持测试用全局覆盖 __TEST_IMPORT_META_ENV__），以避免不同模块 import.meta.env 对象不共享导致的注入偏差。
function getEnv(): any {
  try {
    // 1) 基础：Vite 的 import.meta.env（浏览器/打包环境）
    const raw: any = (import.meta as any).env || {};
    let merged: any = { ...raw };

    // 2) 兼容：Node 测试环境（Vitest）下的 process.env
    //    - Vitest 运行于 Node，上下文间 globalThis 可能不同，但 process.env 是进程级共享
    let penv: any = undefined;
    try {
      penv = (typeof process !== 'undefined' && (process as any)?.env) ? (process as any).env : undefined;
      if (penv && typeof penv === 'object') {
        merged = { ...merged, ...penv };
      }
    } catch {}

    // 3) 测试专用最高优先级覆盖：__TEST_IMPORT_META_ENV__
    let ov: any = undefined;
    try {
      ov = (globalThis as any).__TEST_IMPORT_META_ENV__;
      if (ov && typeof ov === 'object') {
        merged = { ...merged, ...ov };
      }
    } catch {}

    // 4) 仅测试诊断：镜像关键字段，便于断言覆盖是否生效
    try {
      const penvSnap = penv && typeof penv === 'object' ? {
        VITE_ENABLE_AI_READING: penv.VITE_ENABLE_AI_READING,
        VITE_AI_HEDGE_ENABLED: penv.VITE_AI_HEDGE_ENABLED,
        VITE_AI_HEDGE_LOG_LEVEL: penv.VITE_AI_HEDGE_LOG_LEVEL,
        VITE_AI_HEDGE_DELAY_MS: penv.VITE_AI_HEDGE_DELAY_MS,
        VITE_AI_ABORT_LOSER: penv.VITE_AI_ABORT_LOSER,
      } : undefined;
      const mergedSnap = {
        VITE_ENABLE_AI_READING: merged?.VITE_ENABLE_AI_READING,
        VITE_AI_HEDGE_ENABLED: merged?.VITE_AI_HEDGE_ENABLED,
        VITE_AI_HEDGE_LOG_LEVEL: merged?.VITE_AI_HEDGE_LOG_LEVEL,
        VITE_AI_HEDGE_DELAY_MS: merged?.VITE_AI_HEDGE_DELAY_MS,
        VITE_AI_ABORT_LOSER: merged?.VITE_AI_ABORT_LOSER,
      };
      (globalThis as any).__DBG_GETENV__ = {
        ovKeys: ov && typeof ov === 'object' ? Object.keys(ov) : [],
        penv: penvSnap,
        merged: mergedSnap,
      };
    } catch {}

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
  const env: any = getEnv();
  const apiKey = String(env?.VITE_GEMINI_API_KEY || '').trim();
  const enabled = String(env?.VITE_ENABLE_AI_READING || 'false') === 'true';
  if (!enabled || (!apiKey && !(globalThis as any).__AI_FORCE_PROXY__)) throw new Error('AI 未启用或缺少密钥');

  // 读取选中卡片元信息
  let card: StandardCard | null = null;
  try {
    const all = await getAllStandardizedCardsCached({ forceRefresh: false });
    card = all.find((c) => c.id === input.cardId) ?? null;
  } catch { card = null; }

  const model = String(env?.VITE_GEMINI_MODEL || 'gemini-1.5-pro').trim();

  // 代理/直连开关：测试可通过 __AI_FORCE_PROXY__ 强制代理，从而命中 /api/ai/gemini/ 前缀
  const forceProxy = !!(globalThis as any).__AI_FORCE_PROXY__;
  const rawProxy = env?.VITE_AI_DEV_PROXY;
  const proxyOn = forceProxy || ['1', 'true', 'yes', 'on'].includes(String(rawProxy ?? '').toLowerCase());

  // 构造 URL 与鉴权
  const directUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const proxyUrl = `/api/ai/gemini/generate`;
  const url = proxyOn ? proxyUrl : directUrl;
  
  // 移除临时 DEBUG 日志与 URL 捕获
  
  const prompt = buildPromptV12({ question: input.question, card, reversed: !!input.reversed });

  const aiMaxTokens = (() => {
    const v = Number(env?.VITE_AI_MAX_TOKENS); return Number.isFinite(v) && v > 0 ? Math.floor(v) : 896;
  })();
  const aiTimeoutMs = (() => {
    const v = Number(env?.VITE_AI_TIMEOUT_MS); return Number.isFinite(v) && v > 0 ? Math.floor(v) : 15000;
  })();
  const aiRetries = (() => {
    const gr = Number(env?.VITE_GEMINI_RETRIES);
    if (Number.isFinite(gr) && gr >= 0) return Math.floor(gr);
    const v = Number(env?.VITE_AI_RETRIES); return Number.isFinite(v) && v >= 0 ? Math.floor(v) : 2;
  })();

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.65, topK: 40, topP: 0.95, maxOutputTokens: aiMaxTokens, responseMimeType: 'application/json' },
  };

  const headers: Record<string, string> = { Accept: 'application/json' };
  // 直连 Google 不需要 Authorization 头（使用 URL key），代理也不需要。

  const res = await postJsonWithRetry(url, body, { timeoutMs: aiTimeoutMs, retries: aiRetries, baseDelayMs: 300, headers, signal: opts.signal });

  // 解析 Gemini 响应（代理应返回与直连一致的 JSON 结构）
  const text: string | undefined = res?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text || typeof text !== 'string') throw new Error('AI 无候选内容');

  return normalizeInterpretResult(input.cardId, !!input.reversed, text);
}

// 新增：Zhipu 接入（支持代理与直连两种模式）
async function tryZhipuInterpret(input: InterpretInput, opts: { signal?: AbortSignal } = {}): Promise<InterpretResult> {
  const env: any = getEnv();
  const enabled = String(env?.VITE_ENABLE_AI_READING ?? 'false') === 'true';
  const disabledZhipu = String(env?.VITE_DISABLE_ZHIPU ?? '0') === '1';
  const forceZhipu = !!(globalThis as any).__AI_FORCE_ZHIPU__;
  if (!enabled || (disabledZhipu && !forceZhipu)) throw new Error('Zhipu 未启用');

  const apiKey = String(env?.VITE_ZHIPU_API_KEY || '').trim();
  const forceProxy = !!(globalThis as any).__AI_FORCE_PROXY__;
  const rawProxy = env?.VITE_AI_DEV_PROXY;
  const proxyOn = forceProxy || ['1', 'true', 'yes', 'on'].includes(String(rawProxy ?? '').toLowerCase());

  // 读取卡片元信息（失败不阻断）
  let card: StandardCard | null = null;
  try {
    const all = await getAllStandardizedCardsCached({ forceRefresh: false });
    card = all.find((c) => c.id === input.cardId) ?? null;
  } catch { card = null; }

  const prompt = buildPromptV12({ question: input.question, card, reversed: !!input.reversed });

  // 构造 URL 与 headers。代理：/api/ai/zhipu；直连：open.bigmodel.cn，且必须带 Authorization。
  const url = proxyOn ? '/api/ai/zhipu' : 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

  // 移除临时 DEBUG 日志与 URL 捕获

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (!proxyOn) {
    // 直连必须有 Key
    if (!apiKey && !forceZhipu) throw new Error('缺少 Zhipu API Key');
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  }

  // 按照 Zhipu Chat Completions 结构构造 body（对齐测试桩：choices[0].message.content）
  const body = {
    model: 'glm-4-flash',
    messages: [{ role: 'user', content: prompt }],
  };

  const timeoutMs = Number(env?.VITE_AI_TIMEOUT_MS) || 15000;
  // 兼容测试里单独配置 VITE_ZHIPU_RETRIES
  const retries = Number(env?.VITE_ZHIPU_RETRIES);
  const aiRetries = Number.isFinite(retries) && retries >= 0 ? Math.floor(retries) : (Number(env?.VITE_AI_RETRIES) || 2);

  const res = await postJsonWithRetry(url, body, { timeoutMs, retries: aiRetries, baseDelayMs: 300, headers, signal: opts.signal });

  const text: string | undefined = res?.choices?.[0]?.message?.content;
  if (!text || typeof text !== 'string') throw new Error('Zhipu 无候选内容');

  return normalizeInterpretResult(input.cardId, !!input.reversed, text);
}

/**
 * interpretQuestion：根据“问题 + 牌势”返回解读结果
 * - 默认启用 Mock（当未配置 VITE_USE_MOCK 时也视为 true），用于 UI/流程联调
 * - 若设置 VITE_ENABLE_AI_READING=true 且提供 VITE_GEMINI_API_KEY，则优先尝试 AI，失败即回退 Mock
 *
 * 环境变量（可选）：
 * - VITE_ENABLE_AI_READING: 'true' | 'false'，默认 'false'
 * - VITE_GEMINI_API_KEY: string，未配置则不会走 AI
 * - VITE_GEMINI_MODEL: string，默认 'gemini-1.5-pro'
 * - VITE_USE_MOCK: 'true' | 'false'，默认 'true'（当 AI 关闭时生效）
 * - VITE_MOCK_DELAY_MIN/VITE_MOCK_DELAY_MAX/VITE_MOCK_FAIL_RATE：同原逻辑
 * - VITE_AI_MAX_TOKENS: number，默认 896（用于 generationConfig.maxOutputTokens）
 * - VITE_AI_TIMEOUT_MS: number，默认 15000（用于 AI 请求超时）
 * - VITE_AI_RETRIES: number，默认 2（用于 AI 请求重试次数）
 */
// 轻量 Promise.any 替代实现：在老的 TS lib 目标下避免直接使用 Promise.any
function promiseAnyFulfilled<T>(promises: Promise<T>[]): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let rejections = 0;
    const total = promises.length;
    if (total === 0) {
      reject(new Error('No promises to race'));
      return;
    }
    for (const p of promises) {
      p.then(resolve).catch(() => {
        rejections += 1;
        if (rejections >= total) {
          reject(new Error('All promises rejected'));
        }
      });
    }
  });
}

export async function interpretQuestion(
  input: InterpretInput,
  opts: { timeoutMs?: number; retries?: number; baseDelayMs?: number } = {},
): Promise<InterpretResult> {
  const env: any = getEnv();
  const enableAI = String(env?.VITE_ENABLE_AI_READING ?? 'false') === 'true';

  // 移除临时 DEBUG 日志与环境捕获

  // 运行时覆盖（仅测试）：作为提供方允许/禁止的开关，而非“只走某一路”
  const forceGemVal = (globalThis as any).__AI_FORCE_GEMINI__;
  const forceZhiVal = (globalThis as any).__AI_FORCE_ZHIPU__;
  const allowGemini = forceGemVal === undefined ? true : !!forceGemVal;
  const allowZhipu = forceZhiVal === undefined ? true : !!forceZhiVal;

  if (enableAI) {
    const hedgeCfg = readHedgeConfig(env);

    // 测试诊断：记录分支门控的即时快照（不影响业务逻辑）
    try { (globalThis as any).__HEDGE_GATES__ = { enabled: !!hedgeCfg.enabled, allowGemini, allowZhipu, logLevel: hedgeCfg.logLevel }; } catch {}
    // 进一步记录解析用的 env 关键信息与最终配置，便于排查 env 未生效
    try {
      const ov = (globalThis as any).__TEST_IMPORT_META_ENV__;
      const raw = (import.meta as any)?.env || {};
      let pEnvVals: any = {};
      try {
        const penv: any = (typeof process !== 'undefined' && (process as any)?.env) ? (process as any).env : undefined;
        if (penv && typeof penv === 'object') {
          pEnvVals = {
            VITE_ENABLE_AI_READING: penv.VITE_ENABLE_AI_READING,
            VITE_AI_HEDGE_ENABLED: penv.VITE_AI_HEDGE_ENABLED,
            VITE_AI_HEDGE_LOG_LEVEL: penv.VITE_AI_HEDGE_LOG_LEVEL,
            VITE_AI_HEDGE_DELAY_MS: penv.VITE_AI_HEDGE_DELAY_MS,
            VITE_AI_ABORT_LOSER: penv.VITE_AI_ABORT_LOSER,
          };
        }
      } catch {}
      (globalThis as any).__HEDGE_DEBUG__ = {
        ovKeys: ov && typeof ov === 'object' ? Object.keys(ov) : [],
        rawEnv: {
          VITE_ENABLE_AI_READING: raw?.VITE_ENABLE_AI_READING,
          VITE_AI_HEDGE_ENABLED: raw?.VITE_AI_HEDGE_ENABLED,
          VITE_AI_HEDGE_LOG_LEVEL: raw?.VITE_AI_HEDGE_LOG_LEVEL,
          VITE_AI_HEDGE_DELAY_MS: raw?.VITE_AI_HEDGE_DELAY_MS,
          VITE_AI_ABORT_LOSER: raw?.VITE_AI_ABORT_LOSER,
        },
        env: {
          VITE_ENABLE_AI_READING: env?.VITE_ENABLE_AI_READING,
          VITE_AI_HEDGE_ENABLED: env?.VITE_AI_HEDGE_ENABLED,
          VITE_AI_HEDGE_LOG_LEVEL: env?.VITE_AI_HEDGE_LOG_LEVEL,
          VITE_AI_HEDGE_DELAY_MS: env?.VITE_AI_HEDGE_DELAY_MS,
          VITE_AI_ABORT_LOSER: env?.VITE_AI_ABORT_LOSER,
        },
        cfg: hedgeCfg,
      };
    } catch {}

    // 若开启 Hedge 且两路均允许：采用“先 Gemini，delay 后起 Zhipu；先成功者胜出；按配置中止败方；总超时控制”
    if (hedgeCfg.enabled && allowGemini && allowZhipu) {
      // 测试可见的分支标记（不影响业务）：进入 hedge 分支
      try { (globalThis as any).__HEDGE_BRANCH__ = 'hedge'; } catch {}
      // 日志门控：仅在 Hedge 开启时根据级别输出，避免污染正常控制台
      const levelOrder: Record<HedgeLogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
      const threshold = levelOrder[hedgeCfg.logLevel] ?? 2;
      const hlog = (level: HedgeLogLevel, ...args: any[]) => {
        if (levelOrder[level] < threshold) return;
        // 在开发态附加 [hedge] 前缀，便于 grep；生产可继续保留 warn/error
        if (level === 'debug') console.log('[hedge]', ...args);
        else if (level === 'info') console.info('[hedge]', ...args);
        else if (level === 'warn') console.warn('[hedge]', ...args);
        else console.error('[hedge]', ...args);
        // 测试可选捕获：当存在全局钩子时，镜像一份日志事件供单测稳定断言
        const sink = (globalThis as any).__HEDGE_LOG_CAPTURE__;
        if (typeof sink === 'function') {
          try { sink(level, ...args); } catch {}
        }
        // 进一步镜像：记录最近一次事件与胜者（仅测试读取，不影响业务）
        try {
          (globalThis as any).__HEDGE_LAST_EVENT__ = { level, args };
          if (level === 'info' && args && args[0] === 'winner') {
            (globalThis as any).__HEDGE_WINNER__ = args[1];
          }
        } catch {}
      };

      const totalTimeoutMs = (() => {
        const n = Number(opts.timeoutMs);
        return Number.isFinite(n) && n > 0 ? Math.floor(n) : (Number(env?.VITE_AI_TIMEOUT_MS) || 15000);
      })();

      const gemCtrl = new AbortController();
      const zhiCtrl = new AbortController();

      type HedgeWinner = { provider: 'gemini' | 'zhipu'; res: InterpretResult };

      // 标注 provider 的 Promise，便于优胜者判定与败方 abort
      const gemP: Promise<HedgeWinner> = tryGeminiInterpret({ ...input, reversed: !!input.reversed }, { signal: gemCtrl.signal })
        .then((res) => ({ provider: 'gemini' as const, res }));
      const zhiP: Promise<HedgeWinner> = (async () => {
        // 受控延迟后再起跑 Zhipu；若期间已超时/胜出，将在后续 abort 中断
        await delay(Math.max(0, hedgeCfg.delayMs));
        if (zhiCtrl.signal.aborted) throw new Error('aborted-before-start');
        return tryZhipuInterpret({ ...input, reversed: !!input.reversed }, { signal: zhiCtrl.signal })
          .then((res) => ({ provider: 'zhipu' as const, res }));
      })();

      // 使用本地 promiseAnyFulfilled 实现“第一个成功者”
      const firstFulfilled = promiseAnyFulfilled<HedgeWinner>([gemP, zhiP]);
      const timeoutRace = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Hedge total timeout')), Math.max(1, totalTimeoutMs));
      });

      try {
        const winner = await Promise.race([firstFulfilled, timeoutRace]) as HedgeWinner;
        hlog('info', 'winner', winner.provider);
        if (hedgeCfg.abortLoser) {
          if (winner.provider === 'gemini') {
            zhiCtrl.abort('loser-abort');
            hlog('debug', 'abort loser: zhipu');
          } else {
            gemCtrl.abort('loser-abort');
            hlog('debug', 'abort loser: gemini');
          }
        }
        return winner.res;
      } catch (err) {
        // 触发总超时或两路均失败：中止未完成的请求，交由下方 Mock 回退
        gemCtrl.abort('total-timeout-or-all-failed');
        zhiCtrl.abort('total-timeout-or-all-failed');
        hlog('warn', 'hedge failed, fallback to mock', err instanceof Error ? err.message : err);
        // 继续走下方回退逻辑
      }
    } else {
      // 测试可见的分支标记（不影响业务）：进入顺序分支
      try { (globalThis as any).__HEDGE_BRANCH__ = 'sequential'; } catch {}
      // 常规顺序：先 Gemini，失败后（若允许）尝试 Zhipu
      let lastErr: any;
      if (allowGemini) {
        try {
          const ai = await tryGeminiInterpret({ ...input, reversed: !!input.reversed });
          return ai;
        } catch (e) { lastErr = e; }
      }

      if (allowZhipu) {
        try {
          const ai2 = await tryZhipuInterpret({ ...input, reversed: !!input.reversed });
          return ai2;
        } catch (e) { lastErr = e; }
      }
      // 失败时回退到 Mock
    }
  }

  // ====== Mock 路径保持不变 ======
  const useMock = String(env?.VITE_USE_MOCK ?? 'true') === 'true';
  if (useMock) {
    const min = Number(env?.VITE_MOCK_DELAY_MIN ?? 300);
    const max = Number(env?.VITE_MOCK_DELAY_MAX ?? 900);
    const failRate = Number(env?.VITE_MOCK_FAIL_RATE ?? 0);
    const span = Math.max(0, max - min);
    const wait = min + Math.floor(Math.random() * (span + 1));
    await delay(wait);
    if (failRate > 0 && Math.random() < Math.max(0, Math.min(1, failRate))) {
      throw new Error('网络异常，请稍后再试');
    }
    let cardName: string | undefined;
    try {
      const all = await getAllStandardizedCardsCached({ forceRefresh: false });
      cardName = all.find((c) => c.id === input.cardId)?.name;
    } catch { /* ignore */ }
    return buildMockInterpretation({ ...input, reversed: !!input.reversed }, cardName);
  }

  if (import.meta.env.DEV) {
    return buildMockInterpretation({ ...input, reversed: !!input.reversed });
  }
  throw new Error('解读服务暂未接入，请稍后再试');
}

/**
 * 本地 Mock 结果生成器：
 * - 结合卡牌名称、正/逆位与问题语境，生成可信的占位文案
 * - 保证字段完整，便于 UI 三态验收
 */
function buildMockInterpretation(input: InterpretInput, cardName?: string): InterpretResult {
  const title = cardName || '你所抽到的牌';
  const ori = input.reversed ? '（逆位）' : '（正位）';
  const q = input.question.trim();

  // 核心解读：三段结构，兼顾专业度与可执行方向
  const coreParts: string[] = [
    `塔罗洞察：${title}${ori}揭示当下情势的核心关键词是“专注 · 取舍”。`,
    q
      ? `围绕“${q}”，这张牌提示你先对真正重要的事建立次序，再在合适的节点推进。`
      : '这张牌提示你先对真正重要的事建立次序，再在合适的节点推进。',
    input.reversed
      ? '逆位能量提醒：外界噪音与自我质疑可能被放大，先稳住节奏，避免因短期波动改变长期策略。'
      : '正位能量鼓励：资源与环境正向对你敞开，坚持聚焦与耐心，进展会逐步变得清晰可见。',
  ];
  const core = coreParts.join('\n');

  // 行动建议：3-5 条，含可执行与校验维度
  const actionsBase = [
    '把目标拆成 3 个可执行小步，并在本周逐一完成。',
    '与一位可信的人交流观点，补全信息与盲区。',
    input.reversed
      ? '重大决策前先等待 24-48 小时，做一次信息复核。'
      : '为最关键的一步设定量化验收标准（如 DRI/截止时间/成功判据）。',
    '为可能的阻塞列出 1-2 个备选路径，提前准备切换条件。',
    '用一次简短的复盘（10-15 分钟）记录今天的进展与卡点。',
  ];
  // 取前 3-5 条，避免过长
  const actions = actionsBase.slice(0, 4 + (input.reversed ? 0 : 1));

  // 现实考量：三条固定维度（边界与责任 / 认知盲点 / 时间窗与复盘）
  const warnings = [
    input.reversed
      ? '边界与责任：把“不可控因素”剥离出你的责任范围，避免为所有结果背锅。'
      : '边界与责任：明确你能直接影响的范围，把精力投入到可控变量上。',
    '认知盲点：关注信息源的一致性与样本代表性，避免以偏概全。',
    input.reversed
      ? '时间窗与复盘： yourself一个 1-2 周的观察窗，按周节奏复盘并调整策略。'
      : '时间窗与复盘：以 1 周为最小步长进行节奏检查，建立“目标-行动-反馈”的闭环',
  ];

  return {
    cardId: input.cardId,
    reversed: !!input.reversed,
    core,
    actions,
    warnings,
  };
}