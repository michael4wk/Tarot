/// <reference types="vite/client" />

// 为 .vue 单文件组件补充模块声明，
// 保障编辑器（TS 语言服务 / Volar）在任何扩展状态下都能识别模板内标识符，
// 避免出现“类型 {} 上不存在属性 …”这类由上下文推断失败引发的误报。
declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  // 使用 unknown 替代 any，以符合 @typescript-eslint/no-explicit-any 规则
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}
