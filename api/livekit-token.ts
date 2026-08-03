import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';

type SupabaseAuthUser = {
  id: string;
  email?: string;
  user_metadata?: {
    nickname?: string;
    name?: string;
    full_name?: string;
  };
};

const jsonResponse = (body: unknown, status = 200) => new Response(
  JSON.stringify(body),
  {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  },
);

const getAuthenticatedUser = async (authorization: string) => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase 서버 환경변수가 설정되지 않았습니다.');
  }

  const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
    headers: {
      apikey: supabaseAnonKey,
      Authorization: authorization,
    },
  });

  if (!response.ok) return null;
  return response.json() as Promise<SupabaseAuthUser>;
};

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'POST 요청만 허용됩니다.' }, 405);
  }

  const authorization = req.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return jsonResponse({ error: '로그인이 필요합니다.' }, 401);
  }

  const livekitUrl = process.env.LIVEKIT_URL;
  const livekitApiKey = process.env.LIVEKIT_API_KEY;
  const livekitApiSecret = process.env.LIVEKIT_API_SECRET;

  if (!livekitUrl || !livekitApiKey || !livekitApiSecret) {
    return jsonResponse({
      error: 'LiveKit 환경변수가 설정되지 않았습니다. LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET을 확인해 주세요.',
    }, 503);
  }

  try {
    const user = await getAuthenticatedUser(authorization);
    if (!user) {
      return jsonResponse({ error: '로그인 세션이 만료되었습니다. 다시 로그인해 주세요.' }, 401);
    }

    const body = await req.json() as {
      roomName?: string;
      maxParticipants?: number;
      position?: 'affirmative' | 'negative';
      role?: 'debater' | 'opening' | 'rebuttal' | 'closing' | 'moderator';
    };
    const roomName = body.roomName?.trim();
    if (!roomName || !/^debate-[a-zA-Z0-9_-]{8,80}$/.test(roomName)) {
      return jsonResponse({ error: '올바르지 않은 토론방입니다.' }, 400);
    }

    const maxParticipants = Math.min(7, Math.max(2, Number(body.maxParticipants) || 2));
    const position = body.position === 'negative' ? 'negative' : 'affirmative';
    const allowedRoles = ['debater', 'opening', 'rebuttal', 'closing', 'moderator'];
    const role = allowedRoles.includes(body.role || '') ? body.role : 'debater';

    const displayName = user.user_metadata?.nickname
      || user.user_metadata?.name
      || user.user_metadata?.full_name
      || user.email?.split('@')[0]
      || '토론 참가자';

    const livekitApiHost = livekitUrl
      .replace(/^wss:/, 'https:')
      .replace(/^ws:/, 'http:');
    const roomService = new RoomServiceClient(livekitApiHost, livekitApiKey, livekitApiSecret);
    const existingRooms = await roomService.listRooms([roomName]);
    if (existingRooms.length === 0) {
      await roomService.createRoom({
        name: roomName,
        maxParticipants,
        emptyTimeout: 10 * 60,
        departureTimeout: 5 * 60,
        metadata: JSON.stringify({ app: 'thinkbattle', mode: 'pvp', maxParticipants }),
      });
    }

    const accessToken = new AccessToken(livekitApiKey, livekitApiSecret, {
      identity: user.id,
      name: displayName.slice(0, 60),
      ttl: '2h',
      metadata: JSON.stringify({ app: 'thinkbattle', position, role }),
    });
    accessToken.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    return jsonResponse({
      token: await accessToken.toJwt(),
      url: livekitUrl,
    });
  } catch (error) {
    console.error('LiveKit token error:', error);
    return jsonResponse({
      error: error instanceof Error ? error.message : 'LiveKit 접속 토큰을 발급하지 못했습니다.',
    }, 500);
  }
}
