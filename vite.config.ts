import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import livekitTokenHandler from './api/livekit-token'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const geminiApiKey = env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY
  const serverEnvironmentKeys = [
    'LIVEKIT_URL',
    'LIVEKIT_API_KEY',
    'LIVEKIT_API_SECRET',
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY',
  ]

  serverEnvironmentKeys.forEach(key => {
    if (!process.env[key] && env[key]) process.env[key] = env[key]
  })

  return {
    plugins: [
      react(),
      {
        name: 'thinkbattle-livekit-token-dev',
        configureServer(server) {
          server.middlewares.use('/api/livekit-token', async (request, response) => {
            try {
              const requestBody = await new Promise<Buffer>((resolve, reject) => {
                const chunks: Buffer[] = []
                request.on('data', chunk => chunks.push(Buffer.from(chunk)))
                request.on('end', () => resolve(Buffer.concat(chunks)))
                request.on('error', reject)
              })
              const headers = new Headers()
              Object.entries(request.headers).forEach(([key, value]) => {
                if (Array.isArray(value)) value.forEach(item => headers.append(key, item))
                else if (value !== undefined) headers.set(key, value)
              })
              const handlerResponse = await livekitTokenHandler(new Request(
                'http://localhost/api/livekit-token',
                {
                  method: request.method,
                  headers,
                  body: requestBody.length > 0 ? new Uint8Array(requestBody) : undefined,
                },
              ))

              response.statusCode = handlerResponse.status
              handlerResponse.headers.forEach((value, key) => response.setHeader(key, value))
              response.end(Buffer.from(await handlerResponse.arrayBuffer()))
            } catch (error) {
              console.error('Local LiveKit token middleware error:', error)
              response.statusCode = 500
              response.setHeader('Content-Type', 'application/json')
              response.end(JSON.stringify({ error: '로컬 LiveKit 토큰 발급에 실패했습니다.' }))
            }
          })
        },
      },
    ],
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
