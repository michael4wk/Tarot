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
 * 本地 Mock 结果生成器：
 * - 结合卡牌名称、正/逆位与问题语境，生成可信的占位文案
 * - 保证字段完整，便于 UI 三态验收
 */
function buildMockInterpretation(input: InterpretInput, cardName?: string): InterpretResult {
  const title = cardName || '你所抽到的牌';
  const ori = input.reversed ? '（逆位）' : '（正位）';
  const q = input.question.trim();

  // 核心解读：三段结构，兼顾神秘感与可执行的方向感
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

  // 理性提醒：三条固定维度（边界与责任 / 认知盲点 / 时间窗与复盘）
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

/**
 * interpretQuestion：根据“问题 + 牌势”返回解读结果
 * - 默认启用 Mock（当未配置 VITE_USE_MOCK 时也视为 true），用于 UI/流程联调
 * - 后续可切换为真实 API（保留参数位与错误处理骨架）
 *
 * 环境变量（可选）：
 * - VITE_USE_MOCK: 'true' | 'false'，默认 'true'
 * - VITE_MOCK_DELAY_MIN/VITE_MOCK_DELAY_MAX: 模拟耗时（毫秒），默认 300-900ms
 * - VITE_MOCK_FAIL_RATE: 失败注入比例（0~1），默认 0（不失败）
 */
export async function interpretQuestion(
  input: InterpretInput,
  opts: { timeoutMs?: number; retries?: number; baseDelayMs?: number } = {},
): Promise<InterpretResult> {
  const useMock = String((import.meta as any).env?.VITE_USE_MOCK ?? 'true') === 'true';

  // 优先走 Mock：用于 UI 验收与联调
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
