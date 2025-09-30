/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ENABLE_AI_READING?: string;
  readonly VITE_AI_DEV_PROXY?: string;
  readonly VITE_GEMINI_API_KEY?: string;
  readonly VITE_ZHIPU_API_KEY?: string;
  readonly VITE_GEMINI_MODEL?: string;
  readonly VITE_ZHIPU_MODEL?: string;
  readonly VITE_ZHIPU_TEMPERATURE?: string;
  readonly VITE_ZHIPU_TOP_P?: string;
  readonly VITE_ZHIPU_MAX_TOKENS?: string;
  readonly VITE_ZHIPU_FREQ_PENALTY?: string;
  readonly VITE_GEMINI_RETRIES?: string; // 新增：控制 Gemini 的重试次数（测试可设为 0）
  readonly VITE_ZHIPU_RETRIES?: string;
  readonly VITE_DISABLE_ZHIPU?: string;
  readonly VITE_AI_HEDGE_ENABLED?: string;
  readonly VITE_AI_HEDGE_DELAY_MS?: string;
  readonly VITE_AI_ABORT_LOSER?: string;
  readonly VITE_AI_HEDGE_LOG_LEVEL?: string;
  readonly VITE_AI_TIMEOUT_MS?: string; // 新增：顺序模式的总超时（当 interpretQuestion 未显式传入时）
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// 以下为全局类型扩展，用于为日志捕获钩子提供类型安全声明
// 目的：让 globalThis.__HEDGE_LOG_CAPTURE__ 等属性在服务与测试中无需使用 any 即可访问
// 说明：HedgeGlobals 描述了在运行时可能挂载到 window/globalThis 上的调试与诊断字段
declare global {
  // 统一定义日志捕获与诊断相关的全局字段
  interface HedgeGlobals {
    // 日志捕获钩子：用于在测试或诊断时拦截日志输出
    __HEDGE_LOG_CAPTURE__?: (level: string, ...args: unknown[]) => void;
    // 最近一次事件（诊断用），保持 unknown 以避免 any
    __HEDGE_LAST_EVENT__?: unknown;
    // 胜出提供者（诊断用），保持 unknown 以避免 any
    __HEDGE_WINNER__?: unknown;
    // 以下为测试与诊断中使用的开关与辅助字段
    __AI_FORCE_PROXY__?: boolean;
    __AI_FORCE_GEMINI__?: boolean;
    __AI_FORCE_ZHIPU__?: boolean;
    __DEBUG_AI__?: boolean;
    __HEDGE_GATES__?: unknown;
    __HEDGE_BRANCH__?: string;
    __DBG_GETENV__?: unknown;
    __HEDGE_DEBUG__?: unknown;
    __TEST_IMPORT_META_ENV__?: Record<string, string | undefined>;
    __AI_CALL_SEQ__?: unknown[];
    __CAPTURE_AI_URLS__?: unknown;
  }

  // 将 HedgeGlobals 混入到全局对象上，便于类型安全访问
  interface GlobalThis extends HedgeGlobals {}
  interface Window extends HedgeGlobals {}
}

// 将本声明文件视为模块，确保全局扩展生效
export {};
