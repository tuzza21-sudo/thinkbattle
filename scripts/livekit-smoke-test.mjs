import dotenv from 'dotenv';
import {
  AccessToken,
  RoomServiceClient,
  TokenVerifier,
} from 'livekit-server-sdk';

dotenv.config({ path: '.env.local', quiet: true });

const livekitUrl = process.env.LIVEKIT_URL;
const apiKey = process.env.LIVEKIT_API_KEY;
const apiSecret = process.env.LIVEKIT_API_SECRET;

if (!livekitUrl || !apiKey || !apiSecret) {
  throw new Error('LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET이 필요합니다.');
}

const apiHost = livekitUrl
  .replace(/^wss:/, 'https:')
  .replace(/^ws:/, 'http:');
const roomName = `debate-codex-test-${Date.now()}`;
const roomService = new RoomServiceClient(apiHost, apiKey, apiSecret);
let roomCreated = false;

const createParticipantToken = async (identity) => {
  const token = new AccessToken(apiKey, apiSecret, {
    identity,
    name: identity,
    ttl: '10m',
  });
  token.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });
  return token.toJwt();
};

try {
  await roomService.createRoom({
    name: roomName,
    maxParticipants: 6,
    emptyTimeout: 60,
    departureTimeout: 20,
    metadata: JSON.stringify({ app: 'thinkbattle', purpose: 'smoke-test' }),
  });
  roomCreated = true;

  const [room] = await roomService.listRooms([roomName]);
  if (!room) throw new Error('생성한 테스트 방을 다시 조회하지 못했습니다.');

  const identities = Array.from({ length: 6 }, (_, index) => `codex-test-${index + 1}`);
  const tokens = await Promise.all(identities.map(createParticipantToken));
  const verifier = new TokenVerifier(apiKey, apiSecret);
  const [claims, participants] = await Promise.all([
    Promise.all(tokens.map(token => verifier.verify(token))),
    roomService.listParticipants(roomName),
  ]);

  const participantTokensValid = claims.every((claim, index) => (
    claim.sub === identities[index]
    && claim.video?.room === roomName
    && claim.video?.roomJoin === true
  ));

  if (!participantTokensValid) {
    throw new Error('참가자 토큰의 서명 또는 방 권한 검증에 실패했습니다.');
  }

  console.log(JSON.stringify({
    cloudConnection: 'ok',
    roomCreateAndRead: 'ok',
    maxParticipants: room.maxParticipants,
    participantTokens: participantTokensValid ? '6/6 ok' : 'failed',
    activeParticipants: participants.length,
  }, null, 2));
} finally {
  if (roomCreated) {
    await roomService.deleteRoom(roomName);
    const remainingRooms = await roomService.listRooms([roomName]);
    console.log(JSON.stringify({
      testRoomCleanup: remainingRooms.length === 0 ? 'ok' : 'failed',
    }, null, 2));
  }
}
