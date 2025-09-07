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

// 扩展 Vite 环境变量类型声明（仅声明我们在代码中用到的字段）
interface ImportMetaEnv {
  readonly VITE_APP_NAME?: string;
  readonly VITE_API_BASE?: string;
  // AI 相关
  readonly VITE_GEMINI_API_KEY?: string; // 本地开发在 .env.local 配置；切勿提交真实密钥
  readonly VITE_ENABLE_AI_READING?: 'true' | 'false'; // 默认 'false'
  readonly VITE_GEMINI_MODEL?: string; // 如 'gemini-1.5-flash' / 'gemini-1.5-pro'
  // Mock 相关（用于 UI 联调和回退）
  readonly VITE_USE_MOCK?: 'true' | 'false'; // 默认 'true'
  readonly VITE_MOCK_DELAY_MIN?: string; // 毫秒，字符串以匹配 Vite env 约定
  readonly VITE_MOCK_DELAY_MAX?: string; // 毫秒
  readonly VITE_MOCK_FAIL_RATE?: string; // 0-1 小数的字符串
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
