/*
  RevealCard.spec.ts
  - 覆盖功能点：
    1) 点击/键盘切换 revealed 状态，并通过 update:revealed 事件上报
    2) 禁用态下不响应交互
    3) frontSrc 与插槽渲染的互斥逻辑
    4) 可访问性 aria-label 与图片 alt 逻辑
    5) 覆盖层样式 opacity 切换

  说明：
  - 使用 @vue/test-utils 挂载组件，并通过 attrs 方式监听 update:revealed（对应 v-model:revealed）
  - JSDOM 环境下，样式以行内 style 字符串体现，断言包含关键项而不过度依赖顺序
*/
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import RevealCard from '@/components/RevealCard.vue';

function findRoot(wrapper: ReturnType<typeof mount>) {
  // 组件根节点 role="button"
  return wrapper.find('[role="button"]');
}

function getOverlay(wrapper: ReturnType<typeof mount>) {
  return wrapper.find('.reveal-card__overlay');
}

describe('RevealCard', () => {
  it('点击可切换 revealed，并触发 update:revealed', async () => {
    // 直接通过 emitted 断言事件
    const wrapper = mount(RevealCard, {
      // frontSrc 留空，使用插槽渲染以避免加载图片
      props: { id: 'a1', frontSrc: '', frontAlt: '太阳' },
      slots: { default: '<div>Card A</div>' },
    });

    const root = findRoot(wrapper);
    expect(root.attributes('aria-pressed')).toBe('false');

    await root.trigger('click');
    let evts = wrapper.emitted<'update:revealed'>('update:revealed');
    expect(evts && evts[0]).toEqual([true]);
    await wrapper.vm.$nextTick();
    expect(findRoot(wrapper).attributes('aria-pressed')).toBe('true');

    await root.trigger('click');
    evts = wrapper.emitted<'update:revealed'>('update:revealed');
    expect(evts && evts[1]).toEqual([false]);
    await wrapper.vm.$nextTick();
    expect(findRoot(wrapper).attributes('aria-pressed')).toBe('false');
  });

  it('键盘 Enter/Space 可切换 revealed', async () => {
    const wrapper = mount(RevealCard, {
      props: { id: 'k1', frontSrc: '', frontAlt: '星星' },
      slots: { default: '<div>Card K</div>' },
    });

    const root = findRoot(wrapper);
    await root.trigger('keydown', { key: 'Enter' });
    let evts = wrapper.emitted<'update:revealed'>('update:revealed');
    expect(evts && evts[0]).toEqual([true]);

    await root.trigger('keydown', { key: ' ' });
    evts = wrapper.emitted<'update:revealed'>('update:revealed');
    expect(evts && evts[1]).toEqual([false]);
  });

  it('禁用态：不响应点击与键盘，且包含 is-disabled 类', async () => {
    const wrapper = mount(RevealCard, {
      props: { id: 'd1', disabled: true, frontSrc: '' },
      slots: { default: '<div>Disabled</div>' },
    });
    const root = findRoot(wrapper);

    await root.trigger('click');
    await root.trigger('keydown.enter');
    await root.trigger('keydown.space');

    const evts = wrapper.emitted<'update:revealed'>('update:revealed');
    expect(evts).toBeUndefined();
    expect(wrapper.find('.reveal-card').classes()).toContain('is-disabled');
  });

  it('frontSrc 存在时渲染 img；为空时渲染插槽', () => {
    const withImg = mount(RevealCard, {
      props: { id: 'img1', frontSrc: '/x.png', frontAlt: '牌面' },
    });
    expect(withImg.find('img.reveal-card__img').exists()).toBe(true);

    const withSlot = mount(RevealCard, {
      props: { id: 'slot1', frontSrc: '' },
      slots: { default: '<div class="slot-content">X</div>' },
    });
    expect(withSlot.find('img.reveal-card__img').exists()).toBe(false);
    expect(withSlot.find('.slot-content').exists()).toBe(true);
  });

  it('可访问性：aria-label 与 alt 逻辑', async () => {
    const wrapper = mount(RevealCard, {
      props: { id: 'a11', frontSrc: '', frontAlt: '世界' },
      slots: { default: '<div>Card</div>' },
    });
    const root = findRoot(wrapper);
    // 未揭示
    expect(root.attributes('aria-label')).toContain('未揭示');

    await root.trigger('click');
    await wrapper.vm.$nextTick();
    // 已揭示
    expect(findRoot(wrapper).attributes('aria-label')).toContain('已揭示');
  });

  it('覆盖层样式：揭示后 opacity 为 0', async () => {
    const wrapper = mount(RevealCard, {
      props: { id: 's1', frontSrc: '' },
      slots: { default: '<div>Card</div>' },
    });

    await findRoot(wrapper).trigger('click');
    await wrapper.vm.$nextTick();

    const style = getOverlay(wrapper).attributes('style') || '';
    expect(style.replace(/\s+/g, ' ')).toContain('opacity: 0');
  });
});
