<template>
  <main style="display:flex;flex-direction:column;align-items:center;justify-content:flex-start;min-height:100%;gap:24px;padding:24px 16px;">
    <h1>工程基座就绪</h1>

    <!-- PR-2 Checkpoint A：组件层可视化确认（五张随机抽取 + 正/逆位 + 选择命中） -->
    <section class="dev-guides" style="width:100%;padding:16px;border-radius:12px;">
      <h2 style="margin:0 0 12px 0;font-size:18px;">五张牌抽取 · 正/逆位 · 选择命中</h2>
      <div style="display:flex;gap:12px;align-items:center;margin-bottom:8px;">
        <button type="button" @click="onRedraw" :disabled="isLoading || selectedId === null" style="padding:8px 12px;border-radius:8px;">开始新一轮</button>
        <span v-if="isLoading" style="opacity:.8;">加载中...</span>
        <span v-if="selectedId" style="opacity:.9;">已选择：{{ selectedSummary }}</span>
      </div>
      <CardGrid
        :cards="uiCards"
        :gap="16"
        :columns="{ sm: 2, md: 3, lg: 4 }"
        :disabled-ids="disabledIds"
        :revealed-map="revealedMap"
        @update:revealed-map="onUpdateMap"
      />
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { CardGrid } from '@/components';
import type { StandardCard } from '@/services/tarotService';
import { getAllStandardizedCardsCached, pickFiveFromDeck } from '@/services/tarotService';
// 开发期可视化：图片映射覆盖率校验（仅 DEV 打印报告，无副作用）
import { logValidationReport } from '@/utils/imageMappingValidator';

// 组件消费层类型：仅需要 id/frontSrc/alt/isReversed
interface DemoCard { id: string; frontSrc: string; alt?: string; isReversed?: boolean }

const isLoading = ref(false);
const selectedId = ref<string | null>(null);
const revealedMap = reactive<Record<string, boolean>>({});
const disabledIds = ref<string[]>([]);

const deck78 = ref<StandardCard[]>([]);
const five = ref<StandardCard[]>([]);
const uiCards = computed<DemoCard[]>(() => five.value.map(c => ({
  id: c.id,
  frontSrc: c.frontSrc,
  alt: c.name,
  isReversed: c.isReversed
})));

const selectedSummary = computed(() => {
  const c = five.value.find(x => x.id === selectedId.value);
  if (!c) return '';
  return `${c.name}${c.isReversed ? '（逆位）' : '（正位）'}`;
});

async function ensureDeck() {
  // 修复说明：为避免历史缓存中的 frontSrc 沿用旧的映射结果（导致回退卡背），
  // 开发模式下强制刷新一次数据源，确保新的映射逻辑（images.ts）生效。
  deck78.value = await getAllStandardizedCardsCached({ reversedProbability: 0.3, forceRefresh: import.meta.env.DEV });
}

function redrawFive() {
  five.value = pickFiveFromDeck(deck78.value);
}

async function loadFive() {
  isLoading.value = true;
  try {
    selectedId.value = null;
    Object.keys(revealedMap).forEach(k => delete (revealedMap as any)[k]);
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
  // 首次揭示即视为选择命中：锁定其他卡片
  revealedMap[payload.id] = payload.revealed;
  if (payload.revealed && !selectedId.value) {
    selectedId.value = payload.id;
    disabledIds.value = uiCards.value.filter(c => c.id !== payload.id).map(c => c.id);
  }
}

async function onRedraw() {
  // 方案一：首次揭示后按钮可点，点击开始新一轮（保持同一牌堆）
  if (!selectedId.value) return; // 未揭示前不执行
  selectedId.value = null;
  Object.keys(revealedMap).forEach(k => delete (revealedMap as any)[k]);
  disabledIds.value = [];
  redrawFive();
}

onMounted(() => {
  // 启动时拉取数据 + 开发期输出图片映射覆盖率报告
  loadFive();
  if (import.meta.env.DEV) {
    // 仅在开发环境打印一次映射覆盖率，有助于发现资源命名或映射规则问题
    logValidationReport();
  }
});
</script>

<style scoped>
h1 { font-weight: 600; letter-spacing: 0.02em; }
</style>
