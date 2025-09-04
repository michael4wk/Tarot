<template>
  <main style="display:flex;flex-direction:column;align-items:center;justify-content:flex-start;min-height:100%;gap:24px;padding:24px 16px;">
    <h1>工程基座就绪</h1>

    <!-- PR-2 Checkpoint A：组件层可视化确认（临时演示段） -->
    <section class="dev-guides" style="width:100%;padding:16px;border-radius:12px;">
      <h2 style="margin:0 0 12px 0;font-size:18px;">组件演示 · CardGrid + RevealCard</h2>
      <CardGrid
        :cards="demoCards"
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
import { reactive } from 'vue';
import { CardGrid } from '@/components';
import { attachFrontSrc, type TarotCardLite } from '@/utils/images';

// 组件消费层类型：仅需要 id/frontSrc/alt
interface DemoCard { id: string; frontSrc: string; alt?: string }

// 数据装配层：使用图片映射工具，将 API/域模型数据转换为 frontSrc
const tarotSource: Array<TarotCardLite & { id: string; alt?: string }> = [
  // 大阿卡纳示例（包含异常映射 high_priestess → priestess）
  { id: 'maj-00', type: 'major', value: 'fool', alt: '愚者 Fool' },
  { id: 'maj-02', type: 'major', value: 'high_priestess', alt: '女祭司 The High Priestess' },
  { id: 'maj-10', type: 'major', value: 'wheel_of_fortune', alt: '命运之轮 Wheel of Fortune' },
  { id: 'maj-12', type: 'major', value: 'hanged_man', alt: '倒吊人 The Hanged Man' },
  // 小阿卡纳示例（覆盖四花色与数字/宫廷）
  { id: 'min-c-02', type: 'minor', suit: 'cups', value: 'two', alt: '圣杯二 Two of Cups' },
  { id: 'min-w-a',  type: 'minor', suit: 'wands', value: 'ace', alt: '权杖首牌 Ace of Wands' },
  { id: 'min-s-10', type: 'minor', suit: 'swords', value: 'ten', alt: '宝剑十 Ten of Swords' },
  { id: 'min-p-q',  type: 'minor', suit: 'pentacles', value: 'queen', alt: '星币皇后 Queen of Pentacles' }
];

// 通过工具函数生成 frontSrc，并仅暴露组件所需字段
const demoCards: DemoCard[] = attachFrontSrc(tarotSource).map(({ id, frontSrc, alt }) => ({ id, frontSrc, alt }));

const disabledIds: string[] = ['min-s-10'];
const revealedMap = reactive<Record<string, boolean>>({});

function onUpdateMap(payload: { id: string; revealed: boolean }) {
  revealedMap[payload.id] = payload.revealed;
}
</script>

<style scoped>
h1 { font-weight: 600; letter-spacing: 0.02em; }
</style>
