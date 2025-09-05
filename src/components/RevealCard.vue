<template>
  <!-- 组件：RevealCard（覆盖层透明揭示方案） -->
  <div
    class="reveal-card"
    :class="{ 'is-revealed': innerRevealed, 'is-disabled': disabled, 'is-reversed': reversed }"
    role="button"
    tabindex="0"
    :aria-pressed="innerRevealed"
    :aria-label="ariaLabel"
    @click="onToggle"
    @keydown.enter.prevent="onToggle"
    @keydown.space.prevent="onToggle"
  >
    <!-- 卡面：在未揭示前保持 aria-hidden，防止读屏先读到卡面 -->
    <div class="reveal-card__face" aria-hidden="true">
      <img v-if="frontSrc" class="reveal-card__img" :src="frontSrc" :alt="frontAltComputed" />
      <slot v-else />
    </div>

    <!-- 覆盖层（卡背）：初始不透明；揭示后仅做透明淡出，不做 3D 翻转 -->
    <div class="reveal-card__overlay" :style="overlayStyle" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { isActionKey } from '@/utils/a11y';

interface Props {
  id: string;
  frontSrc?: string; // 卡面图片地址（可选，亦可使用插槽）
  frontAlt?: string; // 卡面可访问描述（揭示后用于 aria-label 的一部分）
  revealed?: boolean; // 受控属性（v-model:revealed 支持）
  disabled?: boolean;
  reversed?: boolean; // 是否逆位，逆位时卡面旋转 180 度
}

// 通过 withDefaults 提供默认值：
// - frontSrc 默认为空字符串（当为空时，组件展示插槽内容）
// - frontAlt 默认为空字符串（避免无意义的 alt）
// - revealed/disabled 默认 false
// - reversed 默认 false
const props = withDefaults(defineProps<Props>(), {
  frontSrc: '',
  frontAlt: '',
  revealed: false,
  disabled: false,
  reversed: false
});

const emit = defineEmits<{
  (e: 'update:revealed', v: boolean): void;
}>();

const innerRevealed = ref<boolean>(props.revealed);
watch(
  () => props.revealed,
  (v) => { innerRevealed.value = v; }
);

const frontAltComputed = computed(() => props.frontAlt ?? '');
const ariaLabel = computed(() => {
  const ori = props.reversed ? '（逆位）' : '';
  return innerRevealed.value
    ? (props.frontAlt ? `已揭示：${props.frontAlt}${ori}` : `已揭示${ori}`)
    : '未揭示卡片，可按空格或回车键揭示';
});

function onToggle(e?: MouseEvent | KeyboardEvent) {
  if (props.disabled) return;
  if (e && e instanceof KeyboardEvent && !isActionKey(e)) return;
  const next = !innerRevealed.value;
  innerRevealed.value = next;
  emit('update:revealed', next);
}

// 通过构建期 URL 解析引入卡背图，保证 dev/preview/build 一致
const cardBackUrl = new URL('../../assets/images/card_back.svg', import.meta.url).toString();

// 覆盖层样式：仅使用 opacity 做透明过渡；背景图通过行内 style 注入可被构建处理
const overlayStyle = computed(() => ({
  opacity: innerRevealed.value ? 0 : 1,
  backgroundColor: 'var(--color-overlay-bg)',
  backgroundImage: `url(${cardBackUrl})`,
  backgroundPosition: 'center',
  backgroundSize: 'cover',
  backgroundRepeat: 'no-repeat'
}));
</script>

<style scoped>
.reveal-card {
  position: relative;
  display: inline-block;
  width: 160px; /* 可按容器自适应，演示用固定值 */
  height: 256px;
  border-radius: var(--card-radius);
  box-shadow: var(--card-shadow);
  cursor: pointer;
  user-select: none;
  outline: none; /* 由 :focus-visible 控制全局焦点样式 */
}
.reveal-card.is-disabled { cursor: not-allowed; opacity: 0.6; }

.reveal-card__face,
.reveal-card__overlay {
  position: absolute;
  inset: 0;
  border-radius: inherit;
}

.reveal-card__face {
  z-index: var(--z-content);
  overflow: hidden;
}
.reveal-card__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform var(--card-reveal-duration) var(--easing-cubic);
}
/* 逆位：卡面旋转 180 度（轻量视觉表达，不影响可达性） */
.reveal-card.is-reversed .reveal-card__img { transform: rotate(180deg); }

.reveal-card__overlay {
  z-index: var(--z-overlay);
  transition: opacity var(--card-reveal-duration) var(--easing-cubic);
  will-change: opacity;
  pointer-events: auto;
}

/* 内部状态控制：reveal 后禁用覆盖层指针事件 */
.reveal-card.is-revealed .reveal-card__overlay {
  pointer-events: none;
}
</style>