import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import livekitTokenHandler from './api/livekit-token'
import geminiHandler from './api/gemini/[...path]'
import loungeHandler from './api/lounge'
import loungeInteractionHandler from './api/lounge-interaction'
import loungeAvatarHandler from './api/lounge-avatar'
import loungeKnowledgeHandler from './api/lounge-knowledge'

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
    'OPENAI_API_KEY',
    'APP_ORIGIN',
    'LIVEKIT_URL',
    'LIVEKIT_API_KEY',
    'LIVEKIT_API_SECRET',
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    // Lounge switches: the developer panel for relationships and the kill switch for long-term memory.
    'LOUNGE_RELATIONSHIP_DEBUG_USERS',
    'LOUNGE_LONG_MEMORY',
    'LOUNGE_KNOWLEDGE',
    'LOUNGE_KNOWLEDGE_CACHE_MS',
    'LOUNGE_KNOWLEDGE_MIN_KNOWLEDGE',
    'LOUNGE_KNOWLEDGE_MIN_EXPERIENCE',
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
        name: 'thinkfit-lounge-avatar-dev',
        configureServer(server) {
          server.middlewares.use('/api/lounge-avatar', async (request, response) => {
            try {
              const body = await readRequestBody(request)
              if (body.length > 2_000_000) { response.statusCode = 413; response.end(JSON.stringify({ error: '사진 용량이 너무 커요.' })); return }
              const headers = toHeaders(request.headers)
              const result = await loungeAvatarHandler(new Request(`${headers.get('x-forwarded-proto') || 'http'}://${headers.get('host') || 'localhost'}/api/lounge-avatar`, {
                method: request.method, headers, body: body.length ? new Uint8Array(body) : undefined,
              }))
              response.statusCode = result.status
              result.headers.forEach((value, key) => response.setHeader(key, value))
              response.end(Buffer.from(await result.arrayBuffer()))
            } catch {
              response.statusCode = 500; response.setHeader('Content-Type', 'application/json')
              response.end(JSON.stringify({ error: '사진 변환 요청을 처리하지 못했어요.' }))
            }
          })
        },
      },
      {
        name: 'thinkfit-lounge-knowledge-dev',
        configureServer(server) {
          server.middlewares.use('/api/lounge-knowledge', async (request, response) => {
            try {
              const body = await readRequestBody(request)
              if (body.length > 20_000) { response.statusCode = 413; response.end(JSON.stringify({ error: '내용이 너무 길어요.' })); return }
              const headers = toHeaders(request.headers)
              const result = await loungeKnowledgeHandler(new Request(`${headers.get('x-forwarded-proto') || 'http'}://${headers.get('host') || 'localhost'}/api/lounge-knowledge`, {
                method: request.method, headers, body: body.length ? new Uint8Array(body) : undefined,
              }))
              response.statusCode = result.status
              result.headers.forEach((value, key) => response.setHeader(key, value))
              response.end(Buffer.from(await result.arrayBuffer()))
            } catch {
              response.statusCode = 500; response.setHeader('Content-Type', 'application/json')
              response.end(JSON.stringify({ error: '저장 요청을 처리하지 못했어요.' }))
            }
          })
        },
      },
      {
        name: 'thinkfit-lounge-dev',
        configureServer(server) {
          server.middlewares.use('/api/lounge-interaction', async (request, response) => {
            try {
              const body = await readRequestBody(request)
              if (body.length > 4000) { response.statusCode = 413; response.end(JSON.stringify({ error: '요청이 너무 큽니다.' })); return }
              const headers = toHeaders(request.headers)
              const result = await loungeInteractionHandler(new Request(`${headers.get('x-forwarded-proto') || 'http'}://${headers.get('host') || 'localhost'}/api/lounge-interaction`, {
                method: request.method, headers, body: body.length ? new Uint8Array(body) : undefined,
              }))
              response.statusCode = result.status
              result.headers.forEach((value, name) => response.setHeader(name, value))
              response.end(Buffer.from(await result.arrayBuffer()))
            } catch { response.statusCode = 502; response.end(JSON.stringify({ error: '대화 보호 연결을 확인해 주세요.' })) }
          })
          server.middlewares.use('/api/lounge', async (request, response) => {
            try {
              const body = await readRequestBody(request)
              if (body.length > 1_500_000) { response.statusCode = 413; response.end(JSON.stringify({ error: '음성이 너무 길어요.' })); return }
              const headers = toHeaders(request.headers)
              const result = await loungeHandler(new Request(`${headers.get('x-forwarded-proto') || 'http'}://${headers.get('host') || 'localhost'}/api/lounge`, {
                method: request.method, headers, body: body.length ? new Uint8Array(body) : undefined,
              }))
              response.statusCode = result.status
              result.headers.forEach((value, key) => {
                if (!['content-encoding', 'content-length', 'transfer-encoding'].includes(key.toLowerCase())) response.setHeader(key, value)
              })
              if (!result.body) { response.end(); return }
              response.flushHeaders()
              const reader = result.body.getReader()
              const cancel = () => { void reader.cancel().catch(() => {}) }
              response.once('close', cancel)
              try {
                while (!response.destroyed) {
                  const { done, value } = await reader.read()
                  if (done || response.destroyed) break
                  if (!response.write(Buffer.from(value))) {
                    await new Promise<void>(resolve => {
                      const resume = () => { response.off('drain', resume); response.off('close', resume); resolve() }
                      response.once('drain', resume); response.once('close', resume)
                    })
                  }
                }
                response.end()
              } finally { response.off('close', cancel); await reader.cancel().catch(() => {}); reader.releaseLock() }
            } catch {
              if (response.headersSent) { response.destroy(); return }
              response.statusCode = 500
              response.setHeader('Content-Type', 'application/json')
              response.end(JSON.stringify({ error: '라운지 요청을 처리하지 못했어요.' }))
            }
          })
        },
      },
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
