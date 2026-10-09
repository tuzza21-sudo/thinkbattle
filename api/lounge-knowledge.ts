import { loungeHosts } from '../src/lib/lounge';
import { loungeEmbeddingModel, loungeKnowledgeDimensions, loungeKnowledgeEmbeddingText, normalizeLoungeEmbedding, readLoungeKnowledgeInput } from '../src/lib/loungeKnowledge';

export const config = { runtime: 'edge' };

const MAX_BODY = 20_000;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

/**
 * Saves one knowledge or experience entry of a character. Only the super administrator may: the database functions
 * check that, and this file asks first so a visitor cannot spend embedding requests. The entry's embedding is made
 * here because the key lives on the server; listing and deleting go straight to the database functions.
 */
export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'POST 요청만 허용됩니다.' }, 405);
  const origin = req.headers.get('origin');
  if (origin && origin !== new URL(req.url).origin && !(process.env.APP_ORIGIN || '').split(',').map(value => value.trim()).includes(origin)) return json({ error: '허용되지 않은 요청입니다.' }, 403);
  const authorization = req.headers.get('authorization') || '';
  if (!/^Bearer \S+$/i.test(authorization)) return json({ error: '로그인 후 이용해 주세요.' }, 401);
  if (Number(req.headers.get('content-length')) > MAX_BODY) return json({ error: '내용이 너무 길어요.' }, 413);
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const key = process.env.OPENAI_API_KEY;
  if (!url || !anon) return json({ error: '서버 설정을 확인해 주세요.' }, 503);
  if (!key) return json({ error: '임베딩을 만들 서버 키(OPENAI_API_KEY)가 설정되지 않았어요.' }, 503);
  try {
    const raw = await req.text();
    if (new TextEncoder().encode(raw).length > MAX_BODY) return json({ error: '내용이 너무 길어요.' }, 413);
    let body: { entry?: unknown };
    try { body = JSON.parse(raw); } catch { return json({ error: '요청 형식이 올바르지 않아요.' }, 400); }
    const read = readLoungeKnowledgeInput(body?.entry, loungeHosts.map(host => host.id));
    if (!read.ok) return json({ error: read.error }, 400);
    const headers = { apikey: anon, Authorization: authorization, 'Content-Type': 'application/json' };
    const rpc = (name: string, params: Record<string, unknown>) => fetch(`${url}/rest/v1/rpc/${name}`, { method: 'POST', headers, body: JSON.stringify(params), signal: AbortSignal.timeout(10_000) });
    // The same check the save makes, made before any paid request.
    const guard = await rpc('admin_list_lounge_knowledge', { p_character: '' });
    if (!guard.ok) {
      const detail = await guard.text().catch(() => '');
      return json({ error: /not authorized/.test(detail) ? '관리자 권한이 필요해요.' : '권한을 확인하지 못했어요. 다시 로그인해 주세요.' }, guard.status === 401 ? 401 : 403);
    }
    const embedded = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: loungeEmbeddingModel, input: loungeKnowledgeEmbeddingText(read.input), dimensions: loungeKnowledgeDimensions, encoding_format: 'float' }), signal: AbortSignal.timeout(20_000),
    });
    if (!embedded.ok) return json({ error: '임베딩을 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.', retryable: true }, 502);
    const vector = normalizeLoungeEmbedding(((await embedded.json().catch(() => null)) as { data?: Array<{ embedding?: unknown }> } | null)?.data?.[0]?.embedding);
    if (!vector) return json({ error: '임베딩 응답을 읽지 못했어요. 잠시 뒤 다시 시도해 주세요.', retryable: true }, 502);
    const { input } = read;
    const saved = await rpc('admin_save_lounge_knowledge', { p_id: input.id ?? null, p_character: input.character, p_kind: input.kind, p_title: input.title, p_content: input.content, p_active: input.active, p_embedding: vector,
      p_tags: input.tags, p_lesson: input.lesson || null, p_category: input.category || null, p_source_note: input.sourceNote || null, p_as_of: input.asOf || null, p_time_sensitive: input.timeSensitive });
    if (!saved.ok) {
      const detail = await saved.text().catch(() => '');
      return json({ error: /not found/.test(detail) ? '수정할 항목을 찾지 못했어요.' : /not authorized/.test(detail) ? '관리자 권한이 필요해요.' : '저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.' }, /not found/.test(detail) ? 404 : /not authorized/.test(detail) ? 403 : 502);
    }
    return json({ id: await saved.json() });
  } catch (error) {
    console.error('[Lounge knowledge] request failed', error instanceof Error ? error.name : 'error');
    return json({ error: '저장 중 문제가 생겼어요. 잠시 뒤 다시 시도해 주세요.', retryable: true }, error instanceof Error && error.name === 'TimeoutError' ? 504 : 502);
  }
}
