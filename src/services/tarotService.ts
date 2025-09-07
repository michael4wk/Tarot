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
  init: RequestInit & { timeout?: number } = {},
): Promise<any> {
  const { timeout = 8000, ...rest } = init;
  const controller = new AbortController();
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
  }
}

// 新增：带重试（指数退避+抖动）的 JSON 请求
async function fetchJsonWithRetry(
  input: RequestInfo | URL,
  {
    timeoutMs = 6000,
    retries = 2,
    baseDelayMs = 300,
  }: { timeoutMs?: number; retries?: number; baseDelayMs?: number } = {},
): Promise<any> {
  let attempt = 0;
  const maxAttempts = retries + 1;

  while (attempt < maxAttempts) {
    try {
      return await fetchWithTimeout(input, { timeout: timeoutMs });
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
  }: { timeoutMs?: number; retries?: number; baseDelayMs?: number; headers?: Record<string, string> } = {},
): Promise<any> {
  let attempt = 0;
  const maxAttempts = retries + 1;
  while (attempt < maxAttempts) {
    try {
      return await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
        timeout: timeoutMs,
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
 *   - actions（行动建议）：2-3 条，总字数 150-200 字以内；每条约 50-65 字；若超过 3 条请仅保留最重要的 2-3 条，并压缩以满足总字数。需包含可执行动作与可验证要素（时间窗/度量/前置条件）。
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

/**
 * 调用 Gemini API（v1beta generateContent）
 * - 默认模型可由 VITE_GEMINI_MODEL 指定（如 gemini-1.5-pro），否则给出安全默认
 * - 成功时返回规范化后的 InterpretResult；失败时由上层回退到 mock
 */
async function tryGeminiInterpret(
  input: InterpretInput,
): Promise<InterpretResult> {
  const apiKey = String((import.meta as any).env?.VITE_GEMINI_API_KEY || '').trim();
  const enabled = String((import.meta as any).env?.VITE_ENABLE_AI_READING || 'false') === 'true';
  if (!enabled || !apiKey) throw new Error('AI 未启用或缺少密钥');

  // 读取选中卡片元信息，便于构建“牌面证据锚点”
  let card: StandardCard | null = null;
  try {
    const all = await getAllStandardizedCardsCached({ forceRefresh: false });
    card = all.find((c) => c.id === input.cardId) ?? null;
  } catch {
    card = null; // 不阻断，缺卡时依然继续
  }

  const model = String((import.meta as any).env?.VITE_GEMINI_MODEL || 'gemini-1.5-pro').trim();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model,
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const prompt = buildPromptV12({ question: input.question, card, reversed: !!input.reversed });

  // 从环境变量读取可调参数，提供健壮的回退默认值
  const aiMaxTokens = (() => {
    const v = Number((import.meta as any).env?.VITE_AI_MAX_TOKENS);
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : 896;
  })();
  const aiTimeoutMs = (() => {
    const v = Number((import.meta as any).env?.VITE_AI_TIMEOUT_MS);
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : 15000;
  })();
  const aiRetries = (() => {
    const v = Number((import.meta as any).env?.VITE_AI_RETRIES);
    return Number.isFinite(v) && v >= 0 ? Math.floor(v) : 2;
  })();

  // 参照官方接口结构，保持最简；安全起见温度适中
  const body = {
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      temperature: 0.65,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: aiMaxTokens,
      // 严格 JSON 输出（不再返回 Markdown 或纯文本）
      responseMimeType: 'application/json',
    },
  };

  const res = await postJsonWithRetry(url, body, {
    timeoutMs: aiTimeoutMs,
    retries: aiRetries,
    baseDelayMs: 300,
    headers: { Accept: 'application/json' },
  });

  // 解析 Gemini 响应
  const text: string | undefined = res?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text || typeof text !== 'string') throw new Error('AI 无候选内容');

  // 开发环境下输出成功信号：用于 QA 阶段快速判定“AI 成功采用”
  // 注意：不打印任何敏感数据（API Key/Prompt/完整回复内容），仅输出来源与关键标识
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.info('[tarotService] AI 成功采用 Gemini 结果', {
      model,
      cardId: input.cardId,
      reversed: !!input.reversed,
    });
  }

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
export async function interpretQuestion(
  input: InterpretInput,
  opts: { timeoutMs?: number; retries?: number; baseDelayMs?: number } = {},
): Promise<InterpretResult> {
  const enableAI = String((import.meta as any).env?.VITE_ENABLE_AI_READING ?? 'false') === 'true';

  // 优先走 AI（当开关打开且配置完整时）
  if (enableAI) {
    try {
      // reversed 明确化，避免后续分支重复转换
      const reversed = !!input.reversed;
      const ai = await tryGeminiInterpret({ ...input, reversed });
      return ai;
    } catch (e) {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn('[tarotService] AI 失败，回退到 Mock。', e);
      }
      // 故意继续走 Mock 分支
    }
  }

  // ====== Mock 路径（原有逻辑，保持向后兼容）======
  const useMock = String((import.meta as any).env?.VITE_USE_MOCK ?? 'true') === 'true';

  if (useMock) {
    const min = Number((import.meta as any).env?.VITE_MOCK_DELAY_MIN ?? 300);
    const max = Number((import.meta as any).env?.VITE_MOCK_DELAY_MAX ?? 900);
    const failRate = Number((import.meta as any).env?.VITE_MOCK_FAIL_RATE ?? 0);

    // 随机延迟（模拟网络抖动）
    const span = Math.max(0, max - min);
    const wait = min + Math.floor(Math.random() * (span + 1));
    await delay(wait);

    // 失败注入（可选，默认 0）
    if (failRate > 0 && Math.random() < Math.max(0, Math.min(1, failRate))) {
      throw new Error('网络异常，请稍后再试');
    }

    // 读取卡名用于生成更贴合的文案（失败时降级为通用文案）
    let cardName: string | undefined;
    try {
      const all = await getAllStandardizedCardsCached({ forceRefresh: false });
      cardName = all.find((c) => c.id === input.cardId)?.name;
    } catch {
      /* ignore */
    }

    return buildMockInterpretation({ ...input, reversed: !!input.reversed }, cardName);
  }

  // 真实 API 入口（预留）：
  // 说明：当前尚未确定服务端契约，暂不发起真实请求。
  // 若必须尝试请求，可在此接入 fetchWithTimeout/fetchJsonWithRetry；失败时在 DEV 环境回退到 Mock。
  if (import.meta.env.DEV) {
    // 在开发环境，若关闭了 Mock 依然尝试调用，则回退本地结果，避免打断流程
    return buildMockInterpretation({ ...input, reversed: !!input.reversed });
  }

  // 生产环境下提示未接入
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
    `${title}${ori}揭示当下情势的核心关键词是“专注 · 取舍”。`,
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
      ? '时间窗与复盘：给自己一个 1-2 周的观察窗，按周节奏复盘并调整策略。'
      : '时间窗与复盘：以 1 周为最小步长进行节奏检查，建立“目标-行动-反馈”的闭环。',
  ];

  return {
    cardId: input.cardId,
    reversed: !!input.reversed,
    core,
    actions,
    warnings,
  };
}