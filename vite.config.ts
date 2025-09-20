import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import path from 'node:path';
import type { PluginOption } from 'vite';
import { loadEnv } from 'vite';

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
      // Load .env files for the current mode so that keys in .env.local are available to the dev server
      // We DO NOT expose these values to client code; they are only used here in the Node runtime.
      const env = loadEnv(server.config.mode || 'development', process.cwd(), '');

      // Helper to get env with priority: process.env > loaded env > ''
      const getEnv = (k: string) => (process.env as any)[k] ?? (env as any)[k] ?? '';

      // Helper: read raw request body as string
      const readBody = (req: any) =>
        new Promise<string>((resolve, reject) => {
          try {
            let data = '';
            req.on('data', (chunk: Buffer) => (data += chunk.toString('utf-8')));
            req.on('end', () => resolve(data || ''));
            req.on('error', reject);
          } catch (e) { reject(e); }
        });

      const sendJson = (res: any, status: number, payload: unknown) => {
        res.statusCode = status;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(payload));
      };

      // POST /api/ai/gemini/generate
      server.middlewares.use('/api/ai/gemini/generate', async (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end('Method Not Allowed'); return; }
        try {
          const raw = await readBody(req);
          const body = raw ? JSON.parse(raw) : {};

          // Prefer non-VITE_ variables; fallback to VITE_ from .env.local
          const key = (getEnv('GEMINI_API_KEY') || getEnv('VITE_GEMINI_API_KEY')).toString();
          if (!key) { return sendJson(res, 500, { error: 'Missing GEMINI_API_KEY on dev server' }); }

          const model = (getEnv('GEMINI_MODEL') || getEnv('VITE_GEMINI_MODEL') || 'gemini-1.5-pro').toString();
          const upstream = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;

          const r = await fetch(upstream, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(body),
          });
          const text = await r.text();
          res.statusCode = r.status;
          res.setHeader('Content-Type', 'application/json');
          res.end(text);
        } catch (err: any) {
          sendJson(res, 500, { error: 'Gemini proxy failed', message: String(err?.message || err) });
        }
      });

      // POST /api/ai/zhipu
      server.middlewares.use('/api/ai/zhipu', async (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end('Method Not Allowed'); return; }
        try {
          const raw = await readBody(req);
          const body = raw ? JSON.parse(raw) : {};

          const key = (getEnv('ZHIPU_API_KEY') || getEnv('VITE_ZHIPU_API_KEY')).toString();
          if (!key) { return sendJson(res, 500, { error: 'Missing ZHIPU_API_KEY on dev server' }); }

          const model = (getEnv('ZHIPU_MODEL') || getEnv('VITE_ZHIPU_MODEL') || 'glm-4-flash').toString();
          // If client body has no model, inject a default
          if (body && typeof body === 'object' && (body as any).model == null) {
            (body as any).model = model;
          }

          const upstream = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
          const r = await fetch(upstream, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
              // Inject server-side secret, never expose to browser
              Authorization: `Bearer ${key}`,
            },
            body: JSON.stringify(body),
          });
          const text = await r.text();
          res.statusCode = r.status;
          res.setHeader('Content-Type', 'application/json');
          res.end(text);
        } catch (err: any) {
          sendJson(res, 500, { error: 'Zhipu proxy failed', message: String(err?.message || err) });
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
