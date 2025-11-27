import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue';
import path from 'node:path';
import type { PluginOption } from 'vite';
import { loadEnv } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http'
// 为 Node fetch 增加代理支持（工程最佳实践）：在存在 HTTPS_PROXY/HTTP_PROXY 时通过 undici ProxyAgent 走代理
// 说明：许多 VPN/企业代理不会自动代理 Node 的出站连接；使用 ProxyAgent 能显式让 dev 代理的上游请求走系统/本地代理
// 该改动仅影响开发服务器（apply: 'serve'），生产环境请使用后端服务实现正式代理与鉴权
import { ProxyAgent, setGlobalDispatcher } from 'undici'

// Dev-only proxy middleware for AI providers
// - Avoids exposing API keys to the browser by terminating requests in Vite dev server
// - Endpoints:
//   POST /api/ai/gemini/generate  -> Google Generative Language API (generateContent)
//   POST /api/ai/zhipu            -> Zhipu Chat Completions API
// - Reads secrets from process.env (prefer non-VITE_ variables), falls back to VITE_ for convenience in local dev
// - NOTE: This middleware only runs in `vite serve` (apply: 'serve')
function aiProxyPlugin(): PluginOption {
  return {
    name: 'ai-proxy',
    apply: 'serve',
    configureServer(server) {
      // 如果存在代理环境变量，则为 undici 设置全局代理（仅一次）
      try {
        const proxyEnv = (process.env.HTTPS_PROXY || process.env.HTTP_PROXY || '').trim();
        if (proxyEnv) {
          const agent = new ProxyAgent(proxyEnv);
          setGlobalDispatcher(agent);
          if (process.env.NODE_ENV !== 'production') {
            // eslint-disable-next-line no-console
            console.info('[ai-proxy] Using ProxyAgent for upstream via', proxyEnv);
          }
        }
      } catch (e) {
        if (process.env.NODE_ENV !== 'production') {
          // eslint-disable-next-line no-console
          console.warn('[ai-proxy] Failed to set ProxyAgent', { error: String((e as Error)?.message ?? e) });
        }
      }
      // Load .env files for the current mode so that keys in .env.local are available to the dev server
      // We DO NOT expose these values to client code; they are only used here in the Node runtime.
      const env = loadEnv(server.config.mode || 'development', process.cwd(), '');

      // Helper to get env with priority: process.env > loaded env > ''
      const getEnv = (k: string): string => (process.env as NodeJS.ProcessEnv)[k] ?? env[k] ?? ''

      // Helper: read raw request body as string
      const readBody = (req: IncomingMessage) =>
        new Promise<string>((resolve, reject) => {
          try {
            let data = ''
            req.on('data', (chunk: Buffer) => (data += chunk.toString('utf-8')))
            req.on('end', () => resolve(data || ''))
            req.on('error', reject)
          } catch (e) {
            reject(e)
          }
        })

      const sendJson = (res: ServerResponse, status: number, payload: unknown) => {
        res.statusCode = status
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(payload))
      }

      // POST /api/ai/gemini/generate
      server.middlewares.use('/api/ai/gemini/generate', async (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end('Method Not Allowed'); return; }
        try {
          const raw = await readBody(req);
          const body = raw ? JSON.parse(raw) : {};

          // Prefer non-VITE_ variables; fallback to VITE_ from .env.local
          const key = (getEnv('GEMINI_API_KEY') || getEnv('VITE_GEMINI_API_KEY')).toString();
          if (!key) { return sendJson(res, 500, { error: 'Missing GEMINI_API_KEY on dev server' }); }

          const model = (getEnv('GEMINI_MODEL') || getEnv('VITE_GEMINI_MODEL') || 'gemini-2.0-flash').toString();

          // Proxy upstream timeout (ms), prefer non-VITE_ key; default 15000ms（更稳妥，弱网/代理下避免误超时）
          const proxyTimeoutMs = Number((getEnv('AI_PROXY_TIMEOUT_MS') || getEnv('VITE_AI_PROXY_TIMEOUT_MS') || '15000').toString());

          // Helper to attempt an upstream call with specific version+model, with timeout
          const attempt = async (version: 'v1' | 'v1beta', mdl: string) => {
            const upstream = `https://generativelanguage.googleapis.com/${version}/models/${encodeURIComponent(mdl)}:generateContent?key=${encodeURIComponent(key)}`;
            if (process.env.NODE_ENV !== 'production') {
              // eslint-disable-next-line no-console
              console.info('[ai-proxy][gemini] attempt', { version, model: mdl, url: upstream, timeoutMs: proxyTimeoutMs });
            }
            const controller = new AbortController();
            const timer = setTimeout(() => {
              try { controller.abort('timeout'); } catch { controller.abort(); }
            }, proxyTimeoutMs);
            try {
              const r = await fetch(upstream, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify(body),
                signal: controller.signal,
              });
              const status = r.status;
              const text = await r.text();
              if (process.env.NODE_ENV !== 'production') {
                // eslint-disable-next-line no-console
                console.info('[ai-proxy][gemini] upstream response', { version, model: mdl, status });
                // 当上游返回错误（≥400）时，打印返回体的片段，便于快速定位业务原因（模型不可用、配额、权限等）
                if (status >= 400) {
                  let preview = '';
                  let errMsg: unknown = undefined;
                  try { preview = typeof text === 'string' ? text.slice(0, 500) : String(text).slice(0, 500); } catch { /* noop */ }
                  try {
                    const j = JSON.parse(text);
                    // 常见字段：error.message / error.status / message / code
                    errMsg = (j?.error?.message ?? j?.error?.status ?? j?.message ?? j?.code ?? undefined);
                  } catch { /* 非 JSON，直接输出片段 */ }
                  // eslint-disable-next-line no-console
                  console.warn('[ai-proxy][gemini] upstream error body', { version, model: mdl, status, preview, errMsg });
                }
              }
              return { status, text };
            } catch (err) {
              const name = (err as { name?: string })?.name;
              const msg = (err as { message?: string })?.message;
              const reason = (err as unknown as { cause?: unknown; reason?: unknown })?.reason;
              if (name === 'AbortError') {
                if (process.env.NODE_ENV !== 'production') {
                  // eslint-disable-next-line no-console
                  console.warn('[ai-proxy][gemini] upstream timeout', { version, model: mdl, timeoutMs: proxyTimeoutMs, reason });
                }
                return { status: 504, text: JSON.stringify({ error: 'upstream timeout', provider: 'gemini', version, model: mdl }) };
              }
              if (process.env.NODE_ENV !== 'production') {
                // eslint-disable-next-line no-console
                console.warn('[ai-proxy][gemini] upstream error', { version, model: mdl, name, msg });
              }
              throw err;
            } finally {
              clearTimeout(timer);
            }
          };

          // Fallback chain: v1(current) -> v1beta(current) -> v1(flash) -> v1beta(flash)
          const attempts: Array<{ version: 'v1' | 'v1beta'; mdl: string }> = [
            { version: 'v1', mdl: model },
            { version: 'v1beta', mdl: model },
          ];
          if (model !== 'gemini-2.0-flash') {
            // 当外部指定的模型不可用时，回退尝试到 gemini-2.0-flash（同时尝试 v1 与 v1beta），以尽快跑通功能
            attempts.push({ version: 'v1', mdl: 'gemini-2.0-flash' });
            attempts.push({ version: 'v1beta', mdl: 'gemini-2.0-flash' });
          }

          let lastStatus = 404;
          let lastText = '';
          for (const { version, mdl } of attempts) {
            const { status, text } = await attempt(version, mdl);
            lastStatus = status;
            lastText = text;
            // 成功或非 404（包含 504）则直接返回
            if (status !== 404) {
              res.statusCode = status;
              res.setHeader('Content-Type', 'application/json');
              res.end(text);
              return;
            }
          }

          // If all attempts yielded 404, respond with the last 404 body
          res.statusCode = lastStatus;
          res.setHeader('Content-Type', 'application/json');
          res.end(lastText);
        } catch (err: unknown) {
          const name = (err as { name?: string })?.name;
          const msg = (err as { message?: string })?.message;
          // eslint-disable-next-line no-console
          if (process.env.NODE_ENV !== 'production') console.error('[ai-proxy][gemini] proxy failed', { name, msg });
          sendJson(res, 500, { error: 'Gemini proxy failed', message: String((err as Error)?.message ?? err) })
        }
      });

      // POST /api/ai/zhipu
      server.middlewares.use('/api/ai/zhipu', async (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end('Method Not Allowed'); return; }
        try {
          const raw = await readBody(req);
          type ZhipuRequest = { model?: string; [k: string]: unknown }
          let zBody: ZhipuRequest = {}
          if (raw) {
            const parsed = JSON.parse(raw) as unknown
            if (parsed && typeof parsed === 'object') {
              zBody = parsed as ZhipuRequest
            }
          }

          const key = (getEnv('ZHIPU_API_KEY') || getEnv('VITE_ZHIPU_API_KEY')).toString();
          if (!key) { return sendJson(res, 500, { error: 'Missing ZHIPU_API_KEY on dev server' }); }

          const model = (getEnv('ZHIPU_MODEL') || getEnv('VITE_ZHIPU_MODEL') || 'glm-4-flash').toString();
          // If client body has no model, inject a default
          if (zBody && typeof zBody === 'object' && zBody.model == null) {
            zBody.model = model
          }

          const upstream = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
          // 将 Zhipu 代理默认超时同样提升为 15000ms（与 Gemini 保持一致）
          const proxyTimeoutMs = Number((getEnv('AI_PROXY_TIMEOUT_MS') || getEnv('VITE_AI_PROXY_TIMEOUT_MS') || '15000').toString());
          const controller = new AbortController();
          const timer = setTimeout(() => {
            try { controller.abort('timeout'); } catch { controller.abort(); }
          }, proxyTimeoutMs);

          try {
            const r = await fetch(upstream, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                Authorization: `Bearer ${key}`,
              },
              body: JSON.stringify(zBody),
              signal: controller.signal,
            });
            const text = await r.text();
            if (process.env.NODE_ENV !== 'production' && r.status >= 400) {
              let preview = '';
              let errMsg: unknown = undefined;
              try { preview = typeof text === 'string' ? text.slice(0, 500) : String(text).slice(0, 500); } catch { /* noop */ }
              try {
                const j = JSON.parse(text);
                errMsg = (j?.error?.message ?? j?.message ?? j?.error ?? j?.code ?? undefined);
              } catch { /* 非 JSON，直接输出片段 */ }
              // eslint-disable-next-line no-console
              console.warn('[ai-proxy][zhipu] upstream error body', { status: r.status, preview, errMsg });
            }
            res.statusCode = r.status;
            res.setHeader('Content-Type', 'application/json');
            res.end(text);
          } catch (err) {
            const name = (err as { name?: string })?.name;
            const msg = (err as { message?: string })?.message;
            const reason = (err as unknown as { reason?: unknown })?.reason;
            if (name === 'AbortError') {
              if (process.env.NODE_ENV !== 'production') {
                // eslint-disable-next-line no-console
                console.warn('[ai-proxy][zhipu] upstream timeout', { timeoutMs: proxyTimeoutMs, reason });
              }
              return sendJson(res, 504, { error: 'upstream timeout', provider: 'zhipu' });
            }
            if (process.env.NODE_ENV !== 'production') {
              // eslint-disable-next-line no-console
              console.warn('[ai-proxy][zhipu] upstream error', { name, msg });
            }
            sendJson(res, 500, { error: 'Zhipu proxy failed', message: String((err as Error)?.message ?? err) })
          } finally {
            clearTimeout(timer);
          }
        } catch (err: unknown) {
          const name = (err as { name?: string })?.name;
          const msg = (err as { message?: string })?.message;
          if (process.env.NODE_ENV !== 'production') {
            // eslint-disable-next-line no-console
            console.error('[ai-proxy][zhipu] proxy failed before upstream', { name, msg });
          }
          sendJson(res, 500, { error: 'Zhipu proxy failed', message: String((err as Error)?.message ?? err) })
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [vue(), aiProxyPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
    include: ['src/**/*.spec.{ts,tsx}'],
  },
});
