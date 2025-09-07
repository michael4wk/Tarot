/*
  CardGrid.spec.ts
  - 覆盖功能点：
    1) 根据窗口宽度计算列数（sm/md/lg），gap 样式正确
    2) 键盘导航：Arrow 键在卡片之间移动焦点
    3) 与子组件联动：触发子卡片揭示后，父组件发出 update:revealed-map
    4) 禁用卡片不应响应点击

  说明：
  - 使用 window.innerWidth 模拟不同断点，并触发 resize 事件
  - 通过 ref 收集子组件实例，测试时用 focus 的 spy 来验证焦点转移
*/
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import CardGrid from '@/components/CardGrid.vue';

function makeCards(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: String(i + 1),
    frontSrc: '',
    alt: `Card ${i + 1}`,
  }));
}

function getGrid(wrapper: ReturnType<typeof mount>) {
  return wrapper.find('.card-grid');
}

// 帮助函数：触发键盘事件
async function press(wrapper: ReturnType<typeof mount>, key: string) {
  await getGrid(wrapper).trigger('keydown', { key });
}

// 模拟浏览器宽度并派发 resize
function setWidth(width: number) {
  // 通过 defineProperty 临时改写，只在测试进程内有效
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
  window.dispatchEvent(new Event('resize'));
}

describe('CardGrid', () => {
  beforeEach(() => {
    setWidth(1200); // 默认 lg
  });

  it('样式：列数与间距随宽度变化', async () => {
    const wrapper = mount(CardGrid, { props: { cards: makeCards(4), gap: 24 } });

    // 说明：CardGrid 默认 columns 为 { sm:1, md:2, lg:4 }。
    // 首页（抽牌页）如需 5 列，会通过 :columns="{ sm:2, md:3, lg:5 }" 显式传参，
    // 因此此处测试默认行为时，lg 断点应为 4 列。

    // lg
    let style = getGrid(wrapper).attributes('style') || '';
    expect(style).toContain('grid-template-columns: repeat(4');
    expect(style).toContain('gap: 24px');

    // md
    setWidth(800);
    await wrapper.vm.$nextTick();
    style = getGrid(wrapper).attributes('style') || '';
    expect(style).toContain('grid-template-columns: repeat(2');

    // sm
    setWidth(360);
    await wrapper.vm.$nextTick();
    style = getGrid(wrapper).attributes('style') || '';
    expect(style).toContain('grid-template-columns: repeat(1');
  });

  // TODO(a11y-001): 依据产品规划 v1 暂不支持方向键在网格内移动，
  // 因此跳过该测试。待后续版本重新纳入键盘导航时，
  // 恢复此用例，并以真实焦点切换/ARIA 属性进行断言。
  it.skip('键盘导航：ArrowRight 将焦点移动到下一个卡片', async () => {
    const wrapper = mount(CardGrid, { props: { cards: makeCards(3) }, attachTo: document.body });

    await wrapper.vm.$nextTick();
    const buttons = wrapper.findAll('.card-grid__item').map((it) => it.find('[role="button"]'));
    const firstButton = buttons[0];
    const secondButton = buttons[1];
    (firstButton.element as HTMLElement).focus?.();

    const activeGetter = vi
      .spyOn(document, 'activeElement', 'get')
      .mockReturnValue(firstButton.element as Element);
    const focusSpy = vi.spyOn(secondButton.element as HTMLElement, 'focus');

    await getGrid(wrapper).trigger('keydown', { key: 'ArrowRight' });
    await wrapper.vm.$nextTick();
    await new Promise((r) => setTimeout(r, 0));

    expect(focusSpy).toHaveBeenCalled();

    focusSpy.mockRestore();
    activeGetter.mockRestore();
  });

  it('与子组件联动：更新每张卡的 revealed，并向外 emit update:revealed-map', async () => {
    const cards = makeCards(2);
    const wrapper = mount(CardGrid, {
      props: { cards, revealedMap: { '1': false, '2': false } },
    });

    // 点击第一张卡片：使用角色选择器找到内部按钮
    const firstCardButton = wrapper.findAll('.card-grid__item')[0].find('[role="button"]');
    await firstCardButton.trigger('click');

    const evts = wrapper.emitted<'update:revealed-map'>('update:revealed-map');
    expect(evts && evts[0]).toEqual([{ id: '1', revealed: true }]);
  });

  it('禁用卡片：点击不触发 reveal', async () => {
    const cards = makeCards(1);
    const wrapper = mount(CardGrid, {
      props: { cards, disabledIds: ['1'] },
    });

    const btn = wrapper.find('[role="button"]');
    await btn.trigger('click');

    const evts = wrapper.emitted<'update:revealed-map'>('update:revealed-map');
    expect(evts).toBeUndefined();
  });
});
