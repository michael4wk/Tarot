<template>
  <main
    style="
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      min-height: 100%;
      gap: var(--space-main-gap);
      padding: 24px 16px;
    "
  >
    <!-- 品牌位 + 标题/副文案 + 输入与操作 -->
    <section
      class="hero"
      style="
        width: min(100%, 1100px);
        display: flex;
        flex-direction: column;
        gap: var(--space-hero-gap-mobile);
        align-items: stretch;
      "
    >
      <!-- H1 标题：使用令牌字号/行高，保持8pt网格节奏 -->
      <div
        class="hero-title-bar"
        style="display: flex; align-items: center; gap: 10px; margin-bottom: var(--h1-bottom-extra, 0px)"
        aria-label="页面标题"
      >
        <!-- 左侧 Logo：采用本地静态资源，Vite 构建时会输出正确路径 -->
        <img :src="cardLogo" alt="Tarot 标志" class="hero-logo" />
        <h1
          style="
            margin: 0;
            font-size: var(--font-size-h1);
            line-height: var(--line-height-h1);
            font-weight: 600;
            letter-spacing: 0.02em;
          "
        >
          今日指引 · 让塔罗帮助我看清方向
        </h1>
      </div>
      <!-- Body 副文案：统一 Body 尺寸（可后续收敛到 tokens 文案体系） -->
      <p
        style="
          margin: 0;
          color: color-mix(in oklab, var(--color-fg) 90%, black);
          font-size: var(--font-size-body);
          line-height: var(--line-height-body);
        "
      >
        描述你的问题，凭直觉选中那张命运牌，剩下的就交给塔罗吧
      </p>

      <!-- 输入与操作区：输入 + 开始抽牌/重新洗牌（根据状态切换文案与行为） -->
      <div style="display: flex; gap: var(--space-form-row-gap); align-items: center; width: 100%">
        <input
          v-model="question"
          :placeholder="placeholder"
          :disabled="isLoading"
          :aria-invalid="Boolean(errorMsg)"
          style="
            flex: 1;
            min-width: 0;
            height: var(--control-height-md);
            padding: 0 12px;
            border-radius: var(--control-radius);
            border: 1px solid var(--color-border);
            background: rgba(255, 255, 255, 0.02);
            color: var(--color-fg);
            font-size: var(--font-size-body);
            line-height: var(--line-height-body);
          "
        />
        <!-- 开始抽牌按钮：调整属性顺序，使 style 在 @click 之前 -->
        <button
          type="button"
          style="
            height: var(--control-height-md);
            padding: 0 16px;
            border-radius: var(--control-radius);
            border: none;
            font-weight: 600;
            letter-spacing: 0.02em;
            cursor: pointer;
          "
          :style="startBtnStyle"
          :disabled="startBtnDisabled"
          :aria-disabled="startBtnDisabled"
          @click="hasStarted ? onRedraw() : onStart()"
        >
          {{ hasStarted ? '重新洗牌' : '开始抽牌' }}
        </button>
        <button
          v-if="DEV"
          type="button"
          style="
            height: var(--control-height-md);
            padding: 0 12px;
            border-radius: var(--control-radius);
            border: 1px solid var(--color-border);
            background: transparent;
            color: var(--color-fg);
          "
          @click="simulateError"
        >
          模拟错误
        </button>
      </div>

      <!-- Inline 错误 Banner：统一文案“网络异常，请重试” -->
      <div
        v-if="errorMsg"
        role="alert"
        style="
          display: flex;
          align-items: center;
          gap: 8px;
          border: 1px solid color-mix(in oklab, var(--color-accent) 40%, black);
          background: rgba(138, 180, 248, 0.08);
          color: var(--color-fg);
          padding: 8px 12px;
          border-radius: 8px;
          font-size: var(--font-size-body);
          line-height: var(--line-height-body);
        "
      >
        <span style="opacity: 0.9">{{ errorMsg }}</span>
        <button
          type="button"
          style="
            margin-left: auto;
            height: 28px;
            padding: 0 10px;
            border-radius: 6px;
            border: 1px solid var(--color-border);
            background: transparent;
            color: var(--color-fg);
            cursor: pointer;
          "
          @click="retry"
        >
          重试
        </button>
      </div>

      <!-- 问题建议：<=5 条，点击即填充输入框 -->
      <div
        style="
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-suggestions-gap);
          margin-top: var(--space-suggestions-offset-top);
        "
      >
        <button
          v-for="s in suggestions"
          :key="s"
          type="button"
          style="
            padding: 6px 10px;
            border-radius: 999px;
            border: 1px solid var(--color-border);
            background: transparent;
            color: var(--color-fg);
            font-size: var(--font-size-caption);
            line-height: var(--line-height-caption);
            cursor: pointer;
            opacity: 0.9;
          "
          @click="question = s"
        >
          {{ s }}
        </button>
      </div>
    </section>

    <!-- 移除开发辅助区，避免出现双卡区（DEV 专用区已删除） -->

    <!-- 卡牌区域：未开始时展示占位，开始后展示真实卡池与操作 -->
    <section class="card-area" style="width: 100%; padding: 16px; border-radius: 12px">
      <template v-if="!hasStarted">
        <!-- 未开始：展示 5 个卡槽占位（边框示意）；放入与实际卡池相同的限宽容器，保持左边界/布局一致 -->
        <div class="grid-wrap">
          <div class="placeholder-grid">
            <div v-for="n in 5" :key="n" class="placeholder-card" aria-hidden="true"></div>
          </div>
        </div>
      </template>
      <template v-else>
        <!-- 方案A：将状态提示与网格放入同一限宽容器，确保左边界对齐 -->
        <div class="grid-wrap">
          <div class="draw-status">
            <span v-if="isLoading" style="opacity: 0.8">加载中...</span>
            <span v-if="selectedId" style="opacity: 0.9">已选择：{{ selectedSummary }}</span>
          </div>
          <CardGrid
            :cards="uiCards"
            :gap="16"
            :columns="{ sm: 2, md: 3, lg: 5 }"
            :disabled-ids="disabledIds"
            :revealed-map="revealedMap"
            @update:revealed-map="onUpdateMap"
          />
        </div>
      </template>
    </section>

    <!-- 主CTA：开始解读（仅需完成选牌即可触发） -->
    <div ref="ctaRef" style="width: min(100%, 1100px); display: flex; justify-content: center">
      <button
        type="button"
        :disabled="!selectedId || isLoading"
        style="
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
        "
        :aria-disabled="!selectedId || isLoading"
        @click="goToResult"
      >
        开始解读
      </button>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { CardGrid } from '@/components';
import type { StandardCard } from '@/services/tarotService';
import { getAllStandardizedCardsCached, pickFiveFromDeck } from '@/services/tarotService';
// 开发期可视化：图片映射覆盖率校验（仅 DEV 打印报告，无副作用）
import { logValidationReport } from '@/utils/imageMappingValidator';
// 引入本地 Logo 资源（相对当前视图路径）
const cardLogo = '/favicon.png';

// 组件消费层类型：仅需要 id/frontSrc/alt/isReversed
interface DemoCard {
  id: string;
  frontSrc: string;
  alt?: string;
  isReversed?: boolean;
}

const DEV = import.meta.env.DEV;
const router = useRouter();

// 文案 & 输入态
const placeholder = '我和TA的关系会如何发展？';
const question = ref('');
const suggestions = [
  '近期我是否需要调整职业方向？',
  '这次机会值得我投入吗？',
  '我和TA的关系会如何发展？',
  '我该如何走出这段关系？',
  '我当下最需要关注的成长课题是什么？',
];

// 错误态（Inline Banner 固定方案）
const errorMsg = ref('');
function simulateError() {
  errorMsg.value = '网络异常，请重试';
}
function retry() {
  errorMsg.value = '';
}
// 是否已点击“开始抽牌”：未开始时卡池不渲染，仅展示 5 个占位框
const hasStarted = ref(false);
// “开始抽牌/重新洗牌”按钮可用性：未开始需先完成问题输入；开始后始终可点（除加载中）
const startBtnDisabled = computed(
  () => isLoading.value || (!hasStarted.value && !canStartDraw.value),
);
// 动态按钮样式：禁用态使用灰色背景与降低对比度的前景色
const startBtnStyle = computed(() => {
  const disabled = startBtnDisabled.value;
  return {
    background: disabled ? 'var(--color-border)' : 'var(--color-accent)',
    color: disabled ? 'color-mix(in oklab, var(--color-fg) 70%, black)' : '#0b0c10',
    opacity: disabled ? 0.9 : 1,
    cursor: disabled ? 'not-allowed' : 'pointer',
  } as Record<string, string | number>;
});
// “开始抽牌”前置检查
const canStartDraw = computed(() => question.value.trim().length > 0);

const isLoading = ref(false);
const selectedId = ref<string | null>(null);
const revealedMap = reactive<Record<string, boolean>>({});
const disabledIds = ref<string[]>([]);

const deck78 = ref<StandardCard[]>([]);
const five = ref<StandardCard[]>([]);
const uiCards = computed<DemoCard[]>(() =>
  five.value.map((c) => ({
    id: c.id,
    frontSrc: c.frontSrc,
    alt: c.name,
    isReversed: c.isReversed,
  })),
);

const selectedSummary = computed(() => {
  const c = five.value.find((x) => x.id === selectedId.value);
  if (!c) return '';
  return `${c.name}${c.isReversed ? '（逆位）' : '（正位）'}`;
});

const canStartInterpret = computed(() => !!selectedId.value);
// CTA 容器引用：选牌完成后滚动进入视口，保证可见性
const ctaRef = ref<HTMLElement | null>(null);

async function ensureDeck() {
  deck78.value = await getAllStandardizedCardsCached({
    reversedProbability: 0.3,
    forceRefresh: import.meta.env.DEV,
  });
}

function redrawFive() {
  five.value = pickFiveFromDeck(deck78.value);
}

async function loadFive() {
  isLoading.value = true;
  try {
    selectedId.value = null;
    Object.keys(revealedMap).forEach((k) => delete revealedMap[k]);
    disabledIds.value = [];
    if (deck78.value.length === 0) {
      await ensureDeck();
    }
    redrawFive();
  } finally {
    isLoading.value = false;
  }
}

function onUpdateMap(payload: { id: string; revealed: boolean }) {
  revealedMap[payload.id] = payload.revealed;
  if (payload.revealed && !selectedId.value) {
    selectedId.value = payload.id;
    disabledIds.value = uiCards.value.filter((c) => c.id !== payload.id).map((c) => c.id);
    // 选牌后自动滚动让“开始解读”进入视口（提升可发现性）
    if (ctaRef.value) {
      nextTick(() => ctaRef.value?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
    }
  }
}

async function onRedraw() {
  // 允许随时重新洗牌：重置选择、清空翻开状态并重新抽取 5 张
  selectedId.value = null;
  Object.keys(revealedMap).forEach((k) => delete revealedMap[k]);
  disabledIds.value = [];
  redrawFive();
}

function goToResult() {
  if (!canStartInterpret.value) return;
  const sel = five.value.find((c) => c.id === selectedId.value);
  if (!sel) return;
  // 将当前问题与选择写入会话，供结果页消费
  const payload = {
    question: question.value.trim(),
    selected: { id: sel.id, isReversed: !!sel.isReversed },
    createdAt: Date.now(),
  };
  sessionStorage.setItem('tarot2:currentDraw', JSON.stringify(payload));
  router.push({ name: 'Result' });
}

onMounted(() => {
  if (import.meta.env.DEV) {
    logValidationReport();
  }
});

function onStart() {
  // 仅当已输入问题时，允许进入抽牌阶段
  if (!canStartDraw.value || isLoading.value) return;
  hasStarted.value = true; // 标记流程已开始，使卡池替换占位框
  // 清理残留状态后加载五张卡
  selectedId.value = null;
  Object.keys(revealedMap).forEach((k) => delete revealedMap[k]);
  disabledIds.value = [];
  loadFive();
}
</script>

<style scoped>
h1 {
  font-weight: 600;
  letter-spacing: 0.02em;
}
/* 用 tokens 替换魔法数：
   - section 内基础节奏使用 --space-hero-gap-mobile
   - 桌面端通过 --space-hero-gap-desktop-extra 为 H1 增加额外下边距
   视觉总间距 ≈ 基础 12px + 额外 20px = 32px（方案 C） */
.hero {
  --h1-bottom-extra: 0px;
}
@media (min-width: 1024px) {
  .hero {
    --h1-bottom-extra: var(--space-hero-gap-desktop-extra);
  }
}

/* 卡池区域容器：恢复细条纹与光影律动效果 */
.card-area {
  position: relative;
  overflow: hidden;
  isolation: isolate;
  /* 参数化光影配置：可按需在此微调 */
  --shimmer-angle: 17deg; /* 光束倾角：更接近早期截图的微倾 */
  --shimmer-duration: 7.5s; /* 每次扫动时长 */
  --shimmer-blur: 12px; /* 模糊半径：边缘更柔和 */
  --shimmer-opacity: 0.22; /* 整体透明度：降低生硬感 */
  --shimmer-width: 48%; /* 保留旧变量以保持兼容（未使用于椭圆方案，仅作为回滚备用） */
  --shimmer-ease: cubic-bezier(0.4, 0, 0.2, 1); /* 缓入缓出 */
  /* 新增：椭圆聚光灯的几何参数（仅用于 ::after 椭圆光束） */
  --spot-width: 50%; /* 椭圆包围盒宽度：默认约覆盖 1.8 张卡，避免过窄/过宽 */
  --spot-height: 60%; /* 椭圆包围盒高度：较扁形成“横向聚光” */
}
/* 条纹层（极轻）：避免干扰内容可读性 */
.card-area::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  background-image: repeating-linear-gradient(
    90deg,
    rgba(255, 255, 255, 0.06) 0px,
    rgba(255, 255, 255, 0.06) 1px,
    transparent 1px,
    transparent 8px
  );
  opacity: 0.06; /* 细条纹仅作质感，不应喧宾夺主 */
}
/* 光影扫过层：使用椭圆形聚光灯（radial-gradient），从左向右以微倾角扫过 */
.card-area::after {
  content: '';
  /* 采用局部椭圆包围盒并垂直居中，配合 overflow: hidden 防止溢出 */
  position: absolute;
  left: -30%;
  top: 50%;
  width: var(--spot-width);
  height: var(--spot-height);
  transform-origin: center center;
  border-radius: 50%;
  pointer-events: none; /* 50% 做圆角，进一步收敛边缘 */
  /* 椭圆形聚光灯：中心较亮，向外柔和衰减；颜色采用白色低不透明度，泛用且安全 */
  background: radial-gradient(
    ellipse at 50% 50%,
    rgba(255, 255, 255, 0.42) 0%,
    /* 核心亮带 */ rgba(255, 255, 255, 0.28) 30%,
    /* 向外过渡 */ rgba(255, 255, 255, 0.1) 52%,
    /* 柔光外沿 */ rgba(255, 255, 255, 0) 68% /* 完全衰减，避免硬边 */
  );
  filter: blur(var(--shimmer-blur)); /* 静态模糊：软化边缘（性能友好） */
  opacity: var(--shimmer-opacity);
  will-change: transform; /* 提示渲染器：仅 transform 动画 */
  /* 仅使用 transform：translateX + translateY(-50%) + 固定角度 rotate，性能友好 */
  animation: shimmer-sweep-soft var(--shimmer-duration) var(--shimmer-ease) infinite;
}
/* 调整光影参数：方案A + 8deg（仅CSS变量变更） */
.card-area {
  --shimmer-angle: 8deg; /* 从 17deg 调整为 8deg，更贴近正前方光源 */
  --shimmer-ease: linear; /* 改为全程匀速，去除缓入缓出 */
  --spot-width: 48%; /* 椭圆更圆一些（方案A） */
  --spot-height: 68%; /* 椭圆更圆一些（方案A） */
}
@keyframes shimmer-sweep-soft {
  /* 改为匀速关键帧：去掉 12%/88% 停顿，仅保留起止 */
  0% {
    transform: translateX(0) translateY(-50%) rotate(var(--shimmer-angle));
  }
  100% {
    transform: translateX(300%) translateY(-50%) rotate(var(--shimmer-angle));
  }
}
@media (prefers-reduced-motion: reduce) {
  .card-area::after {
    animation: none;
    opacity: 0;
  }
}
/* 保证内容高于装饰层 */
.card-area > * {
  position: relative;
  z-index: 1;
}

/* 占位网格：与 CardGrid 保持一致的响应式列数（<480=2, 480-899=3, ≥900=5）
   并将占位卡片固定为 160×256 与实际卡面尺寸一致，视觉体验统一 */
.placeholder-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  place-items: center; /* 让固定尺寸的占位卡片在网格单元内居中 */
}
@media (min-width: 480px) {
  .placeholder-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@media (min-width: 900px) {
  .placeholder-grid {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
}
/* 占位卡片：固定尺寸以避免在 2 列时过大，使用与 RevealCard 相同的 3:5 比例 */
.placeholder-card {
  width: 160px; /* 与 RevealCard.width 一致 */
  height: 256px; /* 与 RevealCard.height 一致 */
  border: 1.5px dashed var(--color-border);
  border-radius: 12px;
  background: transparent;
  opacity: 0.7;
}

/* 方案A：共享限宽容器，确保“已选择”文字与卡池网格左边界对齐 */
.grid-wrap {
  width: min(100%, 1200px);
  margin: 0 auto;
}
/* 抽牌状态行：与原有内联样式一致，迁移为类便于维护 */
.draw-status {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 8px;
}

/* 标题栏：左 Logo 右标题，保持与 tokens 一致的底部间距由容器控制 */
.hero-title-bar {
  /* 其余布局已在内联中声明，这里保留类以便后续维护或覆盖 */
}
/* 首页 Logo 尺寸与显示策略：在深色背景下保持清晰；若 PNG 为透明背景则无需描边 */
.hero-logo {
  /* 光学居中：为图片中心稍微下移，使其与标题字面中心更为对齐 */
  --hero-logo-optical-shift: 1px; /* 移动端默认下移 1px，可根据视觉再微调 */
  width: 32px;
  height: 32px;
  object-fit: contain; /* 保持原始比例，不裁切 */
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3)); /* 轻微投影提升辨识度 */
  transform: translateY(var(--hero-logo-optical-shift)); /* 通过 CSS 变量控制下移量 */
}
@media (min-width: 900px) {
  .hero-logo {
    --hero-logo-optical-shift: 2px; /* 桌面端标题更大，适当增大下移以保持视觉居中 */
    width: 36px;
    height: 36px;
  }
}
</style>
