import { getCardImagePath, type ArcanaType, type SuitType } from '@/utils/images';
import { withReversal, DEFAULT_REVERSED_PROB } from '@/utils/reversal';

// 原始 API 卡牌类型（必要字段子集）
export interface RawTarotCard {
  name: string
  name_short: string
  type: ArcanaType
  suit?: SuitType | null
  value: string
  meaning_up?: string
  meaning_rev?: string
  desc?: string
}

// 标准化后的卡牌数据（对 UI/业务开放的稳定结构）
export interface StandardCard {
  id: string
  uniqueId: string
  name: string
  name_short: string
  type: ArcanaType
  suit: SuitType | null
  value: string
  meaning_up: string
  meaning_rev: string
  desc: string
  indexPosition: number
  isReversed: boolean
  frontSrc: string
}

// 新增：统一数据源缓存（本地缓存 + 版本控制）与强制刷新检测
const DECK_CACHE_KEY = 'tarot2:deck:std:v1';
interface DeckCache { version: string; timestamp: number; cards: StandardCard[] }
function getAppVersion(): string { return String(import.meta.env?.VITE_APP_VERSION || 'dev'); }
export function detectForceRefresh(): boolean {
  try {
    const nav = (performance.getEntriesByType?.('navigation')?.[0] as PerformanceNavigationTiming | undefined);
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
  try { localStorage.setItem(DECK_CACHE_KEY, JSON.stringify(cache)); } catch { /* ignore quota */ }
}
export interface GetAllOptions { reversedProbability?: number; forceRefresh?: boolean }

// 带超时的 fetch
async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit & { timeout?: number } = {}): Promise<any> {
  const { timeout = 8000, ...rest } = init
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeout)
  try {
    const res = await fetch(input, { ...rest, signal: controller.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(id)
  }
}

// 标准化器
class TarotDataStandardizer {
  standardizeCard(raw: RawTarotCard, index: number): Omit<StandardCard, 'isReversed'> {
    const id = this.generateUniqueId(raw, index)
    const suit = (raw.suit as SuitType) ?? null
    const type = raw.type
    const value = raw.value

    const frontSrc = getCardImagePath({ type, value, suit: suit ?? undefined })

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
    }
  }

  standardizeCards(rawCards: RawTarotCard[]): Array<Omit<StandardCard, 'isReversed'>> {
    return rawCards.map((c, i) => this.standardizeCard(c, i))
  }

  generateUniqueId(raw: RawTarotCard, index: number): string {
    const base = raw.name_short || `${raw.type}-${raw.value}`
    return `${base}_${String(index).padStart(2, '0')}`
  }
}

const standardizer = new TarotDataStandardizer()

// 生成本地 78 张卡牌的简易回退数据（名称/含义使用占位字符串，满足流程演示与开发自检）
function buildLocalFallback78(): RawTarotCard[] {
  const majors = [
    'fool','magician','high_priestess','empress','emperor','hierophant','lovers','chariot','strength','hermit','wheel_of_fortune','justice','hanged_man','death','temperance','devil','tower','star','moon','sun','judgement','world'
  ]
  const suits: SuitType[] = ['cups','wands','swords','pentacles']
  const ranks = ['ace','two','three','four','five','six','seven','eight','nine','ten','page','knight','queen','king']

  const majorCards: RawTarotCard[] = majors.map((v, i) => ({
    name: v.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()),
    name_short: `ar${String(i).padStart(2,'0')}`,
    type: 'major' as ArcanaType,
    value: v,
    suit: null,
    meaning_up: '',
    meaning_rev: '',
    desc: ''
  }))

  const minorCards: RawTarotCard[] = suits.flatMap((suit) =>
    ranks.map((r, i) => ({
      name: `${r} of ${suit}`,
      name_short: `${suit.slice(0,1)}${r.slice(0,1)}${String(i).padStart(2,'0')}`,
      type: 'minor' as ArcanaType,
      suit,
      value: r,
      meaning_up: '',
      meaning_rev: '',
      desc: ''
    }))
  )

  return [...majorCards, ...minorCards]
}

export interface GetFiveOptions {
  reversedProbability?: number
}

// 新增：获取 78 张标准化 + 正/逆位后的完整卡组（带缓存与强制刷新）
export async function getAllStandardizedCardsCached(options: GetAllOptions = {}): Promise<StandardCard[]> {
  const version = getAppVersion();
  const prob = options.reversedProbability ?? DEFAULT_REVERSED_PROB;
  const force = options.forceRefresh ?? detectForceRefresh();

  if (!force) {
    const cache = loadDeckFromCache();
    if (cache && cache.version === version && Array.isArray(cache.cards) && cache.cards.length >= 78) {
      return cache.cards;
    }
  }

  // 1) 拉取 78 张（API 优先，失败回退本地生成）
  let rawList: RawTarotCard[] | null = null
  try {
    const data = await fetchWithTimeout('https://tarotapi.dev/api/v1/cards', { timeout: 8000 })
    rawList = Array.isArray(data) ? (data as RawTarotCard[]) : (data.cards as RawTarotCard[])
  } catch (e) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn('[tarotService] 远程 API 不可用，切换到本地回退数据。', e)
    }
    rawList = buildLocalFallback78()
  }

  // 2) 标准化 → 3) 正逆位赋值
  const standardized = standardizer.standardizeCards(rawList!)
  const withOri = withReversal(standardized, { reversedProbability: prob }) as StandardCard[]

  // 4) 写入缓存
  saveDeckToCache({ version, timestamp: Date.now(), cards: withOri })

  return withOri
}

// 新增：从完整卡组中随机抽取 5 张（不重复）
export function pickFiveFromDeck(cards: StandardCard[], rng: () => number = Math.random): StandardCard[] {
  const n = Math.min(5, cards.length)
  const indices = new Set<number>()
  while (indices.size < n) indices.add(Math.floor(rng() * cards.length))
  return Array.from(indices).map(i => cards[i])
}

// 主流程（向后兼容）：通过缓存获取全部卡，再随机抽取 5 张
export async function getFiveCards(options: GetFiveOptions = {}): Promise<StandardCard[]> {
  const all = await getAllStandardizedCardsCached({
    reversedProbability: options.reversedProbability,
    // 默认按规范：刷新页强制刷新；普通进入使用缓存
    forceRefresh: detectForceRefresh(),
  })
  return pickFiveFromDeck(all)
}

export function selectCardById(cards: StandardCard[], id: string): StandardCard | null {
  return cards.find((c) => c.id === id) || null
}