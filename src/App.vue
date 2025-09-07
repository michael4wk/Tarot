<template>
  <!-- 根组件仅作为路由外壳，实际页面由路由渲染到此处 -->
  <router-view />
</template>

<script setup lang="ts">
// 说明：
// - 为确保单一职责与分层清晰，App 仅承担路由占位，不包含具体页面逻辑；
// - 抽牌页、结果页等实际页面均位于 src/views 下，由路由控制渲染；
// - 这样可避免根组件内存在的副作用（如自动抽牌 loadFive）导致的 UI 异常。
</script>

<style>
/* 根组件不附带样式，避免影响子路由页面的展示与布局。 */
</style>
