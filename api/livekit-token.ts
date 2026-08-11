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

type NodeRequest = {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
};

type NodeResponse = {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  end: (body?: Uint8Array | string) => void;
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

const getVoiceRoomAccess = async (authorization: string, roomName: string, userId: string) => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) throw new Error('Supabase 서버 환경변수가 설정되지 않았습니다.');

  const baseUrl = supabaseUrl.replace(/\/$/, '');
  const authHeaders = {
    apikey: supabaseAnonKey,
    Authorization: authorization,
  };
  const [roomResponse, participantResponse] = await Promise.all([
    fetch(
      `${baseUrl}/rest/v1/live_debate_rooms?room_id=eq.${encodeURIComponent(roomName)}&select=voice_enabled,team_size,allow_moderator,status`,
      { headers: authHeaders },
    ),
    fetch(
      `${baseUrl}/rest/v1/live_debate_room_participants?room_id=eq.${encodeURIComponent(roomName)}&user_id=eq.${encodeURIComponent(userId)}&select=position,role,phase_ids,is_ai`,
      { headers: authHeaders },
    ),
  ]);
  if (!roomResponse.ok || !participantResponse.ok) {
    throw new Error('토론방 참가 권한을 확인하지 못했습니다.');
  }
  const rooms = await roomResponse.json() as Array<{
    voice_enabled?: boolean;
    team_size?: number;
    allow_moderator?: boolean;
    status?: string;
  }>;
  const participants = await participantResponse.json() as Array<{
    position?: 'affirmative' | 'negative' | null;
    role?: 'debater' | 'opening' | 'rebuttal' | 'closing' | 'moderator' | null;
    phase_ids?: string[];
    is_ai?: boolean;
  }>;
  const room = rooms[0];
  const participant = participants[0];
  if (!room?.voice_enabled || room.status !== 'in_progress' || !participant || participant.is_ai) return null;
  return {
    maxParticipants: Math.min(7, Math.max(2, Number(room.team_size || 1) * 2 + (room.allow_moderator ? 1 : 0))),
    position: participant.position ?? null,
    role: participant.role === 'moderator' ? 'moderator' : 'debater',
    phaseIds: Array.isArray(participant.phase_ids) ? participant.phase_ids.slice(0, 8) : [],
  };
};

const handleWebRequest = async (req: Request) => {
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
    };
    const roomName = body.roomName?.trim();
    if (!roomName || !/^debate-[a-zA-Z0-9_-]{8,80}$/.test(roomName)) {
      return jsonResponse({ error: '올바르지 않은 토론방입니다.' }, 400);
    }
    const roomAccess = await getVoiceRoomAccess(authorization, roomName, user.id);
    if (!roomAccess) {
      return jsonResponse({ error: '이 음성 토론방의 참가자로 등록되어 있지 않거나 토론이 진행 중이 아닙니다.' }, 403);
    }

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
      try {
        await roomService.createRoom({
          name: roomName,
          maxParticipants: roomAccess.maxParticipants,
          emptyTimeout: 10 * 60,
          departureTimeout: 5 * 60,
          metadata: JSON.stringify({ app: 'thinkbattle', mode: 'pvp', maxParticipants: roomAccess.maxParticipants }),
        });
      } catch (createError) {
        // Every lobby member requests a token at nearly the same moment. One
        // request can create the room between another request's list/create
        // calls, so treat an already-created room as a successful outcome.
        const roomsAfterConflict = await roomService.listRooms([roomName]);
        if (roomsAfterConflict.length === 0) throw createError;
      }
    }

    const accessToken = new AccessToken(livekitApiKey, livekitApiSecret, {
      identity: user.id,
      name: displayName.slice(0, 60),
      ttl: '2h',
      metadata: JSON.stringify({
        app: 'thinkbattle',
        position: roomAccess.position,
        role: roomAccess.role,
        phaseIds: roomAccess.phaseIds,
      }),
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
};

const toWebRequest = (req: NodeRequest) => {
  const headers = new Headers();
  Object.entries(req.headers || {}).forEach(([key, value]) => {
    if (Array.isArray(value)) value.forEach(item => headers.append(key, item));
    else if (value !== undefined) headers.set(key, value);
  });

  const method = req.method || 'GET';
  const protocol = headers.get('x-forwarded-proto') || 'https';
  const host = headers.get('host') || 'localhost';
  const requestUrl = req.url?.startsWith('http')
    ? req.url
    : `${protocol}://${host}${req.url || '/api/livekit-token'}`;
  let body: string | Uint8Array | undefined;
  if (method !== 'GET' && method !== 'HEAD' && req.body !== undefined && req.body !== null) {
    body = typeof req.body === 'string' || req.body instanceof Uint8Array
      ? req.body
      : JSON.stringify(req.body);
  }

  return new Request(requestUrl, { method, headers, body });
};

function handler(req: Request): Promise<Response>;
function handler(req: NodeRequest, res: NodeResponse): Promise<void>;
async function handler(req: Request | NodeRequest, res?: NodeResponse): Promise<Response | void> {
  try {
    const webRequest = req instanceof Request ? req : toWebRequest(req);
    const response = await handleWebRequest(webRequest);
    if (!res) return response;

    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.end(new Uint8Array(await response.arrayBuffer()));
  } catch (error) {
    console.error('LiveKit request adapter error:', error);
    const response = jsonResponse({ error: 'LiveKit 서버 요청을 처리하지 못했습니다.' }, 500);
    if (!res) return response;
    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.end(new Uint8Array(await response.arrayBuffer()));
  }
}

export default handler;
