<template>
  <router-view />
  <SpeedInsights :route="route.path" />
</template>

<script setup lang="ts">
import { SpeedInsights } from '@vercel/speed-insights/vue';
import { useRoute } from 'vue-router';
const route = useRoute();
</script>

<style>
</style>
