import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const geminiApiKey = env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api/gemini': {
          target: 'https://generativelanguage.googleapis.com',
          changeOrigin: true,
          secure: true,
          rewrite: (path) => {
            const rewrittenPath = path.replace(/^\/api\/gemini/, '')
            if (!geminiApiKey) return rewrittenPath
            const separator = rewrittenPath.includes('?') ? '&' : '?'
            return `${rewrittenPath}${separator}key=${encodeURIComponent(geminiApiKey)}`
          },
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              if (geminiApiKey) {
                proxyReq.setHeader('x-goog-api-key', geminiApiKey)
              }
              proxyReq.setHeader('Content-Type', 'application/json')
            })
          },
        },
      },
    },
  }
})
