export const config = {
  runtime: 'edge',
};

const MAX_REQUEST_BYTES = 4 * 1024 * 1024;
const ALLOWED_MODELS = new Set([
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash-lite',
  'gemini-3.1-flash-tts-preview',
]);

type SupabaseAuthUser = { id: string };
type AiRequestKind = 'text' | 'transcription' | 'tts';

const jsonResponse = (body: unknown, status: number, extraHeaders?: Record<string, string>) => new Response(
  JSON.stringify(body),
  {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  },
);

const getServerSupabaseConfig = () => ({
  url: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  anonKey: process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY,
});

const authenticate = async (authorization: string) => {
  const { url, anonKey } = getServerSupabaseConfig();
  if (!url || !anonKey) throw new Error('Supabase 서버 환경변수가 설정되지 않았습니다.');
  const response = await fetch(`${url.replace(/\/$/, '')}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: authorization },
  });
  if (!response.ok) return null;
  return response.json() as Promise<SupabaseAuthUser>;
};

const consumeQuota = async (
  authorization: string,
  bucket: string,
  limit: number,
  windowSeconds: number,
) => {
  const { url, anonKey } = getServerSupabaseConfig();
  if (!url || !anonKey) throw new Error('Supabase 서버 환경변수가 설정되지 않았습니다.');
  const response = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/consume_ai_api_quota`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: authorization,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      quota_bucket: bucket,
      quota_limit: limit,
      quota_window_seconds: windowSeconds,
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`AI 사용량 제한을 확인하지 못했습니다. ${detail.slice(0, 180)}`);
  }
  return response.json() as Promise<boolean>;
};

const getAllowedOrigin = (req: Request) => {
  const origin = req.headers.get('origin');
  if (!origin) return null;
  const requestOrigin = new URL(req.url).origin;
  const configuredOrigins = (process.env.APP_ORIGIN || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
  return origin === requestOrigin || configuredOrigins.includes(origin) ? origin : false;
};

const parseTarget = (req: Request) => {
  const url = new URL(req.url);
  const capturedPath = url.searchParams.get('path');
  const targetPath = capturedPath
    ? `/${capturedPath}`
    : url.pathname.replace(/^\/api\/gemini/, '');
  const match = targetPath.match(/^\/v1beta\/models\/([^/:]+):(generateContent|streamGenerateContent)$/);
  if (!match || !ALLOWED_MODELS.has(match[1])) return null;

  const isStreaming = match[2] === 'streamGenerateContent';
  const unexpectedQuery = [...url.searchParams.keys()].some(key => key !== 'path' && !(isStreaming && key === 'alt'));
  if (unexpectedQuery || (isStreaming && url.searchParams.get('alt') !== 'sse')) return null;
  return { model: match[1], operation: match[2], targetPath, isStreaming };
};

const classifyRequest = (body: string, model: string): AiRequestKind => {
  if (model.includes('tts') || body.includes('"responseModalities":["AUDIO"]')) return 'tts';
  if (body.includes('"inlineData"') || body.includes('"inline_data"')) return 'transcription';
  return 'text';
};

const QUOTAS: Record<AiRequestKind, { short: number; daily: number }> = {
  text: { short: 60, daily: 300 },
  transcription: { short: 20, daily: 120 },
  tts: { short: 30, daily: 150 },
};

export default async function handler(req: Request) {
  if (req.method !== 'POST') return jsonResponse({ error: 'POST 요청만 허용됩니다.' }, 405, { Allow: 'POST' });

  const allowedOrigin = getAllowedOrigin(req);
  if (allowedOrigin === false) return jsonResponse({ error: '허용되지 않은 요청 출처입니다.' }, 403);

  const authorization = req.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return jsonResponse({ error: '로그인이 필요합니다.' }, 401);

  const target = parseTarget(req);
  if (!target) return jsonResponse({ error: '허용되지 않은 Gemini API 경로 또는 모델입니다.' }, 404);

  const contentLength = Number(req.headers.get('content-length') || 0);
  if (contentLength > MAX_REQUEST_BYTES) return jsonResponse({ error: 'AI 요청 크기 제한을 초과했습니다.' }, 413);

  try {
    const [user, body] = await Promise.all([authenticate(authorization), req.text()]);
    if (!user) return jsonResponse({ error: '로그인 세션이 만료되었습니다. 다시 로그인해 주세요.' }, 401);
    if (!body || new TextEncoder().encode(body).byteLength > MAX_REQUEST_BYTES) {
      return jsonResponse({ error: 'AI 요청 본문이 없거나 크기 제한을 초과했습니다.' }, body ? 413 : 400);
    }
    try {
      JSON.parse(body);
    } catch {
      return jsonResponse({ error: '올바르지 않은 JSON 요청입니다.' }, 400);
    }

    const requestKind = classifyRequest(body, target.model);
    const quota = QUOTAS[requestKind];
    const [withinShortQuota, withinDailyQuota] = await Promise.all([
      consumeQuota(authorization, `${requestKind}:10m`, quota.short, 600),
      consumeQuota(authorization, `${requestKind}:day`, quota.daily, 86_400),
    ]);
    if (!withinShortQuota || !withinDailyQuota) {
      return jsonResponse({ error: 'AI 사용량이 잠시 제한되었습니다. 잠시 후 다시 시도해 주세요.' }, 429, { 'Retry-After': withinDailyQuota ? '600' : '3600' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return jsonResponse({ error: 'Gemini 서버 환경변수가 설정되지 않았습니다.' }, 503);
    const targetUrl = new URL(target.targetPath, 'https://generativelanguage.googleapis.com');
    if (target.isStreaming) targetUrl.searchParams.set('alt', 'sse');
    targetUrl.searchParams.set('key', apiKey);

    // Supabase Authorization 헤더는 Gemini로 전달하지 않는다.
    const response = await fetch(targetUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body,
    });
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set('Cache-Control', 'no-store');
    responseHeaders.delete('set-cookie');
    if (allowedOrigin) {
      responseHeaders.set('Access-Control-Allow-Origin', allowedOrigin);
      responseHeaders.set('Vary', 'Origin');
    } else {
      responseHeaders.delete('Access-Control-Allow-Origin');
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('Gemini API Proxy Error:', error);
    return jsonResponse({ error: error instanceof Error ? error.message : 'AI 요청을 처리하지 못했습니다.' }, 503);
  }
}
