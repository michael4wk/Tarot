<template>
  <main
    style="
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 24px;
      padding: 24px 16px;
    "
  >
    <!-- 顶部：加载/错误/成功三态容器 -->
    <section style="width: min(100%, 1100px)">
      <!-- 加载态 -->
      <div
        v-if="state === 'loading'"
        style="display: flex; align-items: center; gap: 10px; color: var(--color-fg)"
      >
        <span class="spinner" aria-hidden="true"></span>
        <span>正在召唤你的专属解读...</span>
      </div>

      <!-- 错误态 -->
      <div
        v-else-if="state === 'error'"
        role="alert"
        style="
          display: flex;
          align-items: center;
          gap: 10px;
          border: 1px solid color-mix(in oklab, var(--color-accent) 40%, black);
          background: rgba(138, 180, 248, 0.08);
          color: var(--color-fg);
          padding: 10px 12px;
          border-radius: 10px;
        "
      >
        <span style="opacity: 0.9">{{ errorMsg }}</span>
        <button
          type="button"
          @click="retry"
          style="
            margin-left: auto;
            height: 32px;
            padding: 0 12px;
            border-radius: 8px;
            border: 1px solid var(--color-border);
            background: transparent;
            color: var(--color-fg);
            cursor: pointer;
          "
        >
          重试
        </button>
      </div>

      <!-- 成功态 -->
      <div v-else>
        <!-- 页面主标题（保留） -->
        <h1 class="page-title">塔罗神谕</h1>
        <!-- 顶部卡片式信息区：左卡面右信息 -->
        <article class="result-header">
          <div class="result-cover">
            <img :src="coverSrc" :alt="coverAltText" class="result-cover__img" />
          </div>
          <div class="result-meta">
            <h2 class="result-title">
              <span class="zh">{{ titleZh }}</span>
              <span class="sep"> · </span>
              <span class="en">{{ titleEn }}</span>
            </h2>
            <!-- 基础信息：2×2 标签网格（移除名称，改为 类型/花色 与 位态/元素） -->
            <div class="meta-grid">
              <div class="meta-item">
                <span class="meta-label">类型</span>
                <span class="meta-val">{{ typeZh }}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">花色</span>
                <span class="meta-val">{{ suitZh }}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">位态</span>
                <span class="meta-val">{{ isReversed ? '逆位' : '正位' }}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">元素</span>
                <span class="meta-val">{{ elementZh }}</span>
              </div>
            </div>
          </div>
        </article>

        <!-- 问题卡片：置于基本展示与解读之间，强调上下文连续性 -->
        <section class="card question-card">
          <h2 class="card__title">我的问题</h2>
          <p class="card__body">{{ payload?.question }}</p>
        </section>

        <!-- 解读内容：改为两列；“塔罗洞察”在桌面端跨两列 -->
        <section class="cards">
          <div class="card interpret-card interpret-card--wide">
            <h2 class="card__title">塔罗洞察</h2>
            <p class="card__body">{{ result?.core }}</p>
          </div>
          <div class="card">
            <h2 class="card__title">行动建议</h2>
            <ul class="card__list">
              <li v-for="(a, i) in result?.actions" :key="i">{{ a }}</li>
            </ul>
          </div>
          <div v-if="result?.warnings?.length" class="card">
            <h2 class="card__title">现实考量</h2>
            <ul class="card__list">
              <li v-for="(w, i) in result?.warnings" :key="i">{{ w }}</li>
            </ul>
          </div>
        </section>
      </div>
    </section>

    <!-- 免责声明 -->
    <section class="disclaimer">
      <p>
        内容由 Tarot AI
        生成，依据你选择的牌面与通用规则推导，仅供参考，不构成专业建议；重要决策请结合自身判断与现实条件。
      </p>
    </section>

    <!-- 页脚操作：重新占卜 -->
    <section
      style="width: min(100%, 1100px); display: flex; justify-content: center; align-items: center"
    >
      <button type="button" @click="redo" class="primary-cta">重新占卜</button>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { InterpretResult, StandardCard } from '@/services/tarotService';
import { interpretQuestion, getAllStandardizedCardsCached } from '@/services/tarotService';
// 新增：塔罗本地化工具（中文名/花色/等级/元素）
import { toZhSuit, toZhRank, toZhMajor, suitElementZh, majorElementZh } from '@/utils/tarotI18n';

interface Payload {
  question: string;
  selected: { id: string; isReversed: boolean };
  createdAt: number;
}

const router = useRouter();
const state = ref<'loading' | 'success' | 'error'>('loading');
const errorMsg = ref('');
const result = ref<InterpretResult | null>(null);

const payload = ref<Payload | null>(null);
const cardTitle = ref('');
const coverSrc = ref('');
const coverAlt = ref('塔罗牌');
const suitText = ref(''); // 花色或「大阿尔卡那」
const isReversed = ref(false);
// 新增：保存已选中卡片，用于计算中文名/元素等
const currentCard = ref<StandardCard | null>(null);

function redo() {
  sessionStorage.removeItem('tarot2:currentDraw');
  router.push({ name: 'Draw' });
}

function readPayload(): Payload | null {
  const raw = sessionStorage.getItem('tarot2:currentDraw');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function loadCardMeta(cardId: string) {
  const all = await getAllStandardizedCardsCached({
    reversedProbability: 0.3,
    forceRefresh: false,
  });
  const found = all.find((c: StandardCard) => c.id === cardId);
  if (found) {
    currentCard.value = found; // 挂载当前卡片
    cardTitle.value = found.name; // 英文名
    coverSrc.value = found.frontSrc;
    coverAlt.value = found.name;
    suitText.value = found.suit || '大阿尔卡那';
    isReversed.value = Boolean(found.isReversed);
    // 用 CSS 变量控制卡面旋转，仅表达视觉，不参与“位态”逻辑
    document.documentElement.style.setProperty('--tilt', found.isReversed ? '180deg' : '0deg');
  } else {
    currentCard.value = null;
    cardTitle.value = '未知牌';
    suitText.value = '';
  }
}

// 计算属性：中英文牌名、类型中文、花色中文、元素中文、卡面替代文本
const titleEn = computed(() => currentCard.value?.name || cardTitle.value);
const titleZh = computed(() => {
  const c = currentCard.value;
  if (!c) return '';
  if (c.type === 'major') return toZhMajor(c.value);
  const suit = toZhSuit(c.suit, c.type);
  const rank = toZhRank(c.value);
  return `${suit}${rank}`;
});
// 类型：大阿尔卡那 / 小阿尔卡那
const typeZh = computed(() => {
  const c = currentCard.value;
  if (!c) return '';
  return c.type === 'major' ? '大阿尔卡那' : '小阿尔卡那';
});
// 花色：大阿尔卡那显示“—”；小阿尔卡那显示中文花色
const suitZh = computed(() => {
  const c = currentCard.value;
  if (!c) return '';
  return c.type === 'major' ? '—' : toZhSuit(c.suit, c.type);
});
const elementZh = computed(() => {
  const c = currentCard.value;
  if (!c) return '—';
  return c.type === 'major' ? majorElementZh(c.value) : suitElementZh(c.suit);
});
const coverAltText = computed(() => {
  const zh = titleZh.value;
  const en = titleEn.value;
  return `${zh}（${en}）${isReversed.value ? ' - 逆位卡面' : ' - 正位卡面'}`;
});

async function run() {
  state.value = 'loading';
  errorMsg.value = '';
  const p = readPayload();
  if (!p?.question || !p?.selected?.id) {
    errorMsg.value = '缺少必要信息，请返回首页重新选择';
    state.value = 'error';
    return;
  }
  payload.value = p;
  await loadCardMeta(p.selected.id);
  try {
    // 以用户选择的位态为唯一来源，确保一致性
    isReversed.value = Boolean(p.selected.isReversed);
    document.documentElement.style.setProperty('--tilt', isReversed.value ? '180deg' : '0deg');

    // 正逆位来源于用户选择（payload.selected.isReversed），不做推算
    const r = await interpretQuestion({
      question: p.question,
      cardId: p.selected.id,
      reversed: p.selected.isReversed,
    });
    result.value = r;
    state.value = 'success';
  } catch (err) {
    errorMsg.value = (err as Error).message || '网络异常，请稍后再试';
    state.value = 'error';
  }
}

function retry() {
  run();
}

onMounted(() => {
  run();
});
</script>

<style scoped>
/* 页面主标题 */
.page-title {
  margin: 0 0 12px;
  font-size: 22px;
  line-height: 28px;
  font-weight: 700;
  letter-spacing: 0.01em;
}

/* 头部：卡片式容器，左卡面右信息，保持神秘感 */
.result-header {
  display: grid;
  grid-template-columns: 1fr; /* 移动端：上下堆叠 */
  gap: 18px; /* 略增间距，缓解贴近感 */
  padding: 18px;
  border: 1px solid var(--color-border);
  border-radius: 14px;
  background: color-mix(in oklab, var(--color-bg) 92%, black);
  box-shadow: var(--shadow-md, 0 6px 24px rgba(0, 0, 0, 0.24));
}
@media (min-width: 900px) {
  .result-header {
    grid-template-columns: 360px 1fr; /* 桌面：左侧夸张放大的卡面 */
    align-items: center;
    gap: 28px; /* 桌面端进一步加大左右呼吸感 */
  }
}

.result-cover {
  position: relative;
}
.result-cover__img {
  width: 100%;
  aspect-ratio: 3/5;
  border-radius: 12px;
  border: 1px solid var(--color-border);
  object-fit: cover;
  transform: rotate(var(--tilt));
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.35);
}

.result-meta {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 680px;
}
.result-title {
  margin: 0;
  font-size: 30px;
  line-height: 36px;
  font-weight: 700;
  letter-spacing: 0.01em;
}
.result-title .en {
  font-weight: 600;
  opacity: 0.85;
  font-size: 0.92em;
}
.result-title .sep {
  opacity: 0.5;
  margin: 0 8px;
}

/* 基础信息 2×2 标签网格 */
.meta-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 16px;
  margin-top: 2px;
}
@media (min-width: 900px) {
  .meta-grid {
    max-width: 560px;
  }
}
/* 每项采用“上标签、下主值”的两层视觉，并用轻描边强化格块感 */
.meta-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: color-mix(in oklab, var(--color-bg) 96%, black);
}
.meta-label {
  color: color-mix(in oklab, var(--color-fg) 65%, black);
  font-size: 11px;
  letter-spacing: 0.04em;
}
.meta-val {
  font-size: 14px;
  line-height: 20px;
}

/* 旧样式保留（pill/dot 可能用于其他区域） */
.pill {
  display: inline-flex;
  align-items: center;
  height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  background: rgba(255, 255, 255, 0.04);
}
.dot {
  opacity: 0.4;
}

/* 问题卡片 */
.question-card {
  margin-top: 12px;
}

/* 解读内容卡片区：改为两列布局；桌面端“洞察”跨两列 */
.cards {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
  margin-top: 16px;
}
@media (min-width: 900px) {
  .cards {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  /* 洞察卡跨两列 */
  .interpret-card--wide {
    grid-column: 1 / -1;
  }
}
.card {
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 16px;
  background: color-mix(in oklab, var(--color-bg) 94%, black);
  box-shadow: var(--shadow-sm, 0 2px 12px rgba(0, 0, 0, 0.18));
}
.card__title {
  margin: 0 0 8px;
  font-size: 18px;
  line-height: 24px;
  font-weight: 600;
  letter-spacing: 0.01em;
}
.card__body {
  margin: 0;
  /* 调整为 pre-line：保留换行符，折叠多余空格，更适合段落排版与两端对齐 */
  white-space: pre-line;
  line-height: 1.8;
  /* 显式默认左对齐：移动端与除“塔罗洞察”外的区域保持左对齐，提升可读性 */
  text-align: left;
}
.card__list {
  margin: 0;
  padding-left: 18px;
  line-height: 1.8;
}

/* 桌面端（≥900px）：仅对“塔罗洞察”的正文启用两端对齐，最后一行保持自然左对齐
   - 避免窄屏两端对齐产生的字间距拉大问题
   - 列表（行动建议/现实考量）保持左对齐不变 */
@media (min-width: 900px) {
  .interpret-card .card__body {
    text-align: justify;
    text-align-last: left;
  }
}

/* 免责声明与 CTA */
.disclaimer {
  width: min(100%, 1100px);
  color: color-mix(in oklab, var(--color-fg) 70%, black);
  font-size: var(--font-size-caption);
  line-height: var(--line-height-caption);
}
.primary-cta {
  height: 44px;
  padding: 0 20px;
  border-radius: 999px;
  background: var(--color-accent);
  color: #0b0c10;
  border: none;
  font-weight: 700;
  letter-spacing: 0.02em;
  cursor: pointer;
  min-width: 200px;
}

/* Spinner */
.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid color-mix(in oklab, var(--color-fg) 20%, transparent);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>