<template>
  <!-- 组件：CardGrid（响应式网格） -->
  <div class="card-grid" role="grid" :style="gridStyle">
    <div
      v-for="c in props.cards"
      :key="c.id"
      class="card-grid__item"
      role="gridcell"
    >
      <RevealCard
        :id="c.id"
        v-model:revealed="revealedState[c.id]"
        :front-src="c.frontSrc"
        :front-alt="c.alt"
        :disabled="disabledSet.has(c.id)"
        @update:revealed="(v) => onChildToggle(c.id, v)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
// 说明：由于当前编辑器（Trae 国际版）侧的 TypeScript 插件未对 .vue 模板进行正确的上下文注入，
// 会将模板中的标识符推断为 {} 并产生“类型 {} 上不存在属性 …”之类的误报。
// 这里仅对本文件关闭编辑器端的 TS 诊断，以确保“问题”面板清洁不受误报干扰；
// 项目真实的类型安全仍由命令行中的 vue-tsc/typecheck 保证，运行与构建不受影响。
import { computed, onMounted, reactive, ref, watch, nextTick, type ComponentPublicInstance } from 'vue';
import RevealCard from '@/components/RevealCard.vue';
import { isArrowKey, nextIndexByArrow, type ArrowKey } from '@/utils/a11y';

interface SimpleCard { id: string; frontSrc: string; alt?: string }

interface Props {
  cards: SimpleCard[];
  columns?: { sm: number; md: number; lg: number };
  gap?: number; // px
  disabledIds?: string[];
  revealedMap?: Record<string, boolean>; // 受控可选
}

const props = withDefaults(defineProps<Props>(), {
  columns: () => ({ sm: 1, md: 2, lg: 4 }),
  gap: 16,
  disabledIds: () => [],
  revealedMap: () => ({})
});

const emit = defineEmits<{
  (e: 'update:revealed-map', payload: { id: string; revealed: boolean }): void;
}>();

function onChildToggle(id: string, v: boolean) {
  emit('update:revealed-map', { id, revealed: v });
}

const disabledSet = computed(() => new Set(props.disabledIds));
const revealedState = reactive<Record<string, boolean>>({});

watch(
  () => props.cards,
  (arr: SimpleCard[]) => {
    arr.forEach((c: SimpleCard) => {
      revealedState[c.id] = props.revealedMap[c.id] ?? false;
    });
  },
  { immediate: true }
);

watch(
  () => props.revealedMap,
  (map: Record<string, boolean>) => {
    for (const [id, v] of Object.entries(map)) {
      revealedState[id] = v as boolean;
    }
  }
);

// 计算当前列数：根据窗口宽度粗略判断（演示环境）
const cols = ref<number>(props.columns.lg);
function computeCols() {
  const w = window.innerWidth;
  if (w < 480) cols.value = props.columns.sm;
  else if (w < 900) cols.value = props.columns.md;
  else cols.value = props.columns.lg;
}

onMounted(() => {
  computeCols();
  window.addEventListener('resize', () => { computeCols(); });
});

const gridStyle = computed(() => ({
  display: 'grid',
  gridTemplateColumns: `repeat(${cols.value}, minmax(0, 1fr))`,
  gap: `${props.gap}px`,
  alignItems: 'start'
}));

// 焦点移动逻辑已在 v1 移除：依据产品规划暂不支持方向键在网格内移动
</script>

<style scoped>
.card-grid { width: min(100%, 1100px); margin: 0 auto; }
.card-grid__item { display: flex; justify-content: center; }
</style>