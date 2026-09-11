/* Local browser fixture: no production reads or writes. */
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { SessionSettings } from '../src/components/SessionSettings';
import { FlexibleDebateRoom } from '../src/components/FlexibleDebateRoom';
import { createSessionConfig, buildSessionPhases } from '../src/lib/liveDebateSession';
import type { AppUser, LiveDebateRoomSummary } from '../src/types';
import '../src/index.css';
import '../src/App.css';
const query = new URLSearchParams(location.search);
const config = createSessionConfig(900, 2);
config.progressionMode = query.has('automatic') ? 'automatic' : 'moderated';
const plan = buildSessionPhases(config);
const user: AppUser = { id: '00000000-0000-4000-8000-000000000001', email: 'fixture@example.test', nickname: '생각하는 학생', provider: 'email', isAnonymous: false, createdAt: new Date().toISOString() };
const room: LiveDebateRoomSummary = { id: 'fixture', roomId: 'debate-uifixture001', hostId: user.id, hostName: user.nickname, topic: '학교 수업에서 생성형 AI 활용을 허용해야 하는가?', topicDescription: '학생의 학습 자율성과 공정한 평가 기준을 함께 검토합니다.', language: 'ko', debateLevel: 'beginner', voiceEnabled: false, timeLimit: 1020, teamSize: 2, allowModerator: true, audience: 'public', status: 'in_progress', participantCount: 4, createdAt: new Date().toISOString(), sessionConfig: config };
const participants = Array.from({ length: 4 }, (_, index) => ({ room_id: room.roomId, user_id: `00000000-0000-4000-8000-00000000000${index + 1}`, nickname: ['생각하는 학생', '차분한 탐구자', '질문하는 시민', '근거를 찾는 사람'][index], position: index < 2 ? 'affirmative' : 'negative', role: 'debater', phase_ids: [], is_ready: true, is_ai: false, joined_at: new Date().toISOString() }));
let phaseIndex = query.has('strategy') ? 2 : 3, deadline = Date.now() + 150_000, pausedAt: string | null = null, remaining = 0, revision = 0;
const records: Record<string, unknown>[] = participants.map((member, index) => ({ id: `argument-${index}`, room_id: room.roomId, user_id: member.user_id, sender_name: member.nickname, phase_id: `${member.position}-opening`, phase_label: `${index < 2 ? '찬성' : '반대'} 입론`, content: ['AI를 활용하는 능력도 새로운 학습 역량입니다. 활용 과정과 출처를 밝히도록 기준을 만들면 교육적 효과를 높일 수 있습니다.', '학습 과정의 기록을 제출하게 하면 결과물만 평가하는 한계를 보완할 수 있습니다.', '스스로 고민하는 시간이 줄어들 가능성이 있습니다. 모든 학생이 같은 도구에 접근할 수 있는지도 검토해야 합니다.', '어떤 과제와 학년에 활용을 허용하는지 범위를 먼저 명확히 해야 합니다.'][index], source: 'text', created_at: new Date().toISOString() }));
const chat: Record<string, unknown>[] = [];
const nativeFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
  if (url.origin === location.origin && !url.pathname.startsWith('/api/')) return nativeFetch(input, init);
  const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
  let data: unknown = [];
  if (url.pathname.endsWith('/control_live_debate_session')) {
    if (body.action === 'next') { phaseIndex++; deadline = Date.now() + plan[phaseIndex].seconds * 1000; revision++; pausedAt = null; }
    if (body.action === 'pause') { pausedAt = new Date().toISOString(); remaining = (deadline - Date.now()) / 1000; revision++; }
    if (body.action === 'resume') { pausedAt = null; deadline = Date.now() + remaining * 1000; revision++; }
    if (body.action === 'extend') { deadline += 30000; remaining += 30; revision++; }
    data = { room_id: room.roomId, phase_index: phaseIndex, phase_started_at: new Date().toISOString(), deadline_at: new Date(deadline).toISOString(), paused_at: pausedAt, remaining_seconds: remaining, paused_total_seconds: 0, revision, finished_at: null, server_now: new Date().toISOString(), pending_speeches: 0, history: [] };
  } else if (url.pathname.endsWith('/submit_live_session_argument')) {
    records.push({ id: body.argument_id, user_id: user.id, sender_name: user.nickname, content: body.argument_content, source: 'text', phase_id: body.expected_phase_id, phase_label: plan[phaseIndex].label, created_at: new Date().toISOString() }); data = new Date().toISOString();
  } else if (url.pathname.endsWith('/send_live_team_message')) {
    chat.push({ id: body.message_id, user_id: user.id, nickname: user.nickname, body: body.message_body, team_key: 'fixture', created_at: new Date().toISOString() }); data = null;
  } else if (url.pathname.endsWith('/live_debate_arguments')) data = records;
  else if (url.pathname.endsWith('/live_debate_room_participants')) data = participants;
  else if (url.pathname.endsWith('/live_debate_team_messages')) data = [...chat].reverse();
  return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
function Preview() {
  const [settings, setSettings] = useState(config);
  return query.has('settings') ? <div style={{ maxWidth: 680, margin: '20px auto', padding: 20, background: '#fff' }}><SessionSettings value={settings} teamSize={2} onChange={setSettings} /></div> : <MemoryRouter><FlexibleDebateRoom room={room} user={user} /></MemoryRouter>;
}
createRoot(document.getElementById('root')!).render(<Preview />);
