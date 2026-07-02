export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  const url = new URL(req.url);
  
  // 클라이언트가 /api/gemini/... 로 요청한 것을 https://generativelanguage.googleapis.com/... 로 변환
  const targetPath = url.pathname.replace(/^\/api\/gemini/, '');
  const targetUrl = new URL(targetPath + url.search, 'https://generativelanguage.googleapis.com');

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
