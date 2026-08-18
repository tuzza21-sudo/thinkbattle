import { createClient } from 'npm:@supabase/supabase-js@2.110.0';

type CleanupCandidate = {
  path: string;
  argument_id: string;
  user_id: string;
  room_id: string | null;
  size_bytes: number;
  reason: 'retention' | 'capacity' | 'limit';
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cleanup-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

const readNumber = (name: string, fallback: number) => {
  const value = Number(Deno.env.get(name));
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'Supabase server credentials are not configured.' }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const configuredSecret = Deno.env.get('CLEANUP_SECRET');
  const suppliedSecret = request.headers.get('x-cleanup-secret');
  const isScheduledRequest = !!configuredSecret && suppliedSecret === configuredSecret;
  const authHeader = request.headers.get('Authorization');
  let isAuthenticatedUser = false;

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length);
    const { data } = await admin.auth.getUser(token);
    isAuthenticatedUser = !!data.user;
  }

  if (!isScheduledRequest && !isAuthenticatedUser) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const budgetBytes = Math.round(readNumber('LIVE_DEBATE_AUDIO_BUDGET_MB', 700) * 1024 * 1024);
  const retentionDays = Math.round(readNumber('LIVE_DEBATE_AUDIO_RETENTION_DAYS', 90));
  const protectedCount = Math.round(readNumber('LIVE_DEBATE_AUDIO_PROTECTED_COUNT', 20));
  const batchSize = Math.min(1000, Math.round(readNumber('LIVE_DEBATE_AUDIO_CLEANUP_BATCH_SIZE', 500)));
  const maxBatches = Math.min(10, Math.round(readNumber('LIVE_DEBATE_AUDIO_CLEANUP_MAX_BATCHES', 5)));
  const highWatermark = readNumber('LIVE_DEBATE_AUDIO_HIGH_WATERMARK', 0.80);
  const targetWatermark = readNumber('LIVE_DEBATE_AUDIO_TARGET_WATERMARK', 0.65);

  let deletedFiles = 0;
  let deletedBytes = 0;
  const deletedByReason: Record<string, number> = { retention: 0, capacity: 0, limit: 0 };

  for (let batch = 0; batch < maxBatches; batch += 1) {
    const { data, error } = await admin.rpc('get_live_debate_audio_cleanup_candidates', {
      p_budget_bytes: budgetBytes,
      p_high_watermark: highWatermark,
      p_target_watermark: targetWatermark,
      p_retention_days: retentionDays,
      p_protected_count: protectedCount,
      p_limit: batchSize,
    });
    if (error) return json({ error: `Cleanup plan failed: ${error.message}` }, 500);

    const candidates = (data ?? []) as CleanupCandidate[];
    if (candidates.length === 0) break;

    for (const reason of ['retention', 'capacity', 'limit'] as const) {
      const group = candidates.filter(candidate => candidate.reason === reason);
      if (group.length === 0) continue;
      const paths = group.map(candidate => candidate.path);
      const { error: removalError } = await admin.storage.from('live-debate-audio').remove(paths);
      if (removalError) {
        return json({
          error: `Storage cleanup failed: ${removalError.message}`,
          deletedFiles,
          deletedBytes,
        }, 500);
      }
      const { error: markError } = await admin.rpc('mark_live_debate_audio_deleted', {
        p_paths: paths,
        p_reason: reason,
      });
      if (markError) {
        return json({
          error: `Cleanup metadata update failed: ${markError.message}`,
          deletedFiles,
          deletedBytes,
        }, 500);
      }
      deletedFiles += group.length;
      deletedBytes += group.reduce((sum, candidate) => sum + Number(candidate.size_bytes || 0), 0);
      deletedByReason[reason] += group.length;
    }

    if (candidates.length < batchSize) break;
  }

  return json({
    ok: true,
    deletedFiles,
    deletedBytes,
    deletedByReason,
    policy: {
      budgetBytes,
      retentionDays,
      protectedCount,
      highWatermark,
      targetWatermark,
    },
  });
});
