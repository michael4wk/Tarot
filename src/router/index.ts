import { createRouter, createWebHistory } from 'vue-router';
import type { RouteRecordRaw } from 'vue-router';

// 页面级组件采用懒加载，减小首屏体积
const DrawPage = () => import('@/views/DrawPage.vue');
const ResultPage = () => import('@/views/ResultPage.vue');

// 路由表：与技术文档命名保持一致（DrawPage/ResultPage）
const routes: RouteRecordRaw[] = [
  { path: '/', name: 'Draw', component: DrawPage },
  { path: '/result', name: 'Result', component: ResultPage },
];

// 基于 HTML5 History API 的历史模式，便于 SEO 与简洁 URL
const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    // 跳转时回到顶部，避免跨页残留滚动位置
    return { left: 0, top: 0 };
  },
});

export default router;
