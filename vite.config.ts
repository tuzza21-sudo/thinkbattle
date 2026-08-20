import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import livekitTokenHandler from './api/livekit-token'
import geminiHandler from './api/gemini/[...path]'

const readRequestBody = (request: NodeJS.ReadableStream) => new Promise<Buffer>((resolve, reject) => {
  const chunks: Buffer[] = []
  request.on('data', chunk => chunks.push(Buffer.from(chunk)))
  request.on('end', () => resolve(Buffer.concat(chunks)))
  request.on('error', reject)
})

const toHeaders = (source: Record<string, string | string[] | undefined>) => {
  const headers = new Headers()
  Object.entries(source).forEach(([key, value]) => {
    if (Array.isArray(value)) value.forEach(item => headers.append(key, item))
    else if (value !== undefined) headers.set(key, value)
  })
  return headers
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const serverEnvironmentKeys = [
    'GEMINI_API_KEY',
    'APP_ORIGIN',
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
              const requestBody = await readRequestBody(request)
              const handlerResponse = await livekitTokenHandler(new Request(
                'http://localhost/api/livekit-token',
                {
                  method: request.method,
                  headers: toHeaders(request.headers),
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
      {
        name: 'thinkbattle-gemini-gateway-dev',
        configureServer(server) {
          server.middlewares.use('/api/gemini', async (request, response) => {
            try {
              const requestBody = await readRequestBody(request)
              const headers = toHeaders(request.headers)
              const protocol = headers.get('x-forwarded-proto') || 'http'
              const host = headers.get('host') || 'localhost'
              const handlerResponse = await geminiHandler(new Request(
                `${protocol}://${host}/api/gemini${request.url || ''}`,
                {
                  method: request.method,
                  headers,
                  body: requestBody.length > 0 ? new Uint8Array(requestBody) : undefined,
                },
              ))
              response.statusCode = handlerResponse.status
              handlerResponse.headers.forEach((value, key) => {
                if (['content-encoding', 'content-length', 'transfer-encoding'].includes(key.toLowerCase())) return
                response.setHeader(key, value)
              })
              if (!handlerResponse.body) {
                response.end()
                return
              }

              // Keep SSE and audio responses incremental in local development.
              // Buffering with arrayBuffer() made localhost appear much slower
              // than the production edge gateway even when the upstream API streamed.
              response.flushHeaders()
              const reader = handlerResponse.body.getReader()
              try {
                while (true) {
                  const { done, value } = await reader.read()
                  if (done) break
                  if (!response.write(Buffer.from(value))) {
                    await new Promise<void>(resolve => response.once('drain', resolve))
                  }
                }
                response.end()
              } finally {
                reader.releaseLock()
              }
            } catch (error) {
              console.error('Local Gemini gateway middleware error:', error)
              if (response.headersSent) {
                response.destroy(error instanceof Error ? error : undefined)
                return
              }
              response.statusCode = 500
              response.setHeader('Content-Type', 'application/json')
              response.end(JSON.stringify({ error: '로컬 AI 요청 처리에 실패했습니다.' }))
            }
          })
        },
      },
    ],
    build: {
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [{
              name: 'livekit',
              test: /node_modules[\\/](?:livekit-client|@livekit)[\\/]/,
              maxSize: 350 * 1024,
              priority: 10,
            }],
          },
        },
      },
    },
  }
})
