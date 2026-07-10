export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  // OPTIONS Preflight 요청 처리 (CORS 대응)
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, x-goog-api-key, Authorization',
      },
    });
  }

  const url = new URL(req.url);

  // Vercel 리라이트 시 캡처된 경로가 ?path= 쿼리 파라미터로 전달됨
  // 예: /api/gemini/v1beta/models/gemini-3.1-flash-lite:generateContent
  //   → ?path=v1beta/models/gemini-3.1-flash-lite:generateContent
  const capturedPath = url.searchParams.get('path');
  const targetPath = capturedPath
    ? `/${capturedPath}`
    : url.pathname.replace(/^\/api\/gemini/, '');

  // 구글 API 대상 URL 생성 (Vercel이 주입한 path 파라미터는 제외)
  const targetUrl = new URL(targetPath, 'https://generativelanguage.googleapis.com');
  url.searchParams.forEach((value, key) => {
    if (key !== 'path') {
      targetUrl.searchParams.set(key, value);
    }
  });

  const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
  if (apiKey) {
    targetUrl.searchParams.set('key', apiKey);
  }

  // 원래 요청의 헤더를 복사 (host 헤더는 삭제)
  const headers = new Headers(req.headers);
  headers.delete('host');
  if (apiKey) {
    headers.set('x-goog-api-key', apiKey);
  }
  headers.set('Content-Type', 'application/json');

  try {
    const response = await fetch(targetUrl.toString(), {
      method: req.method,
      headers,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined,
    });

    const responseHeaders = new Headers(response.headers);
    responseHeaders.set('Access-Control-Allow-Origin', '*');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('Gemini API Proxy Error:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error while proxying to Gemini' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
