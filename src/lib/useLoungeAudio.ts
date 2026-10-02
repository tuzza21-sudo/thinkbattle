import { useCallback, useEffect, useRef, useState } from 'react';
import { createLocalAudioTrack, LocalAudioTrack, Room, RoomEvent, Track } from 'livekit-client';
import { supabase } from './supabase';
import { Pcm16Decoder, PcmAudioQueue, readLoungeStream } from './loungeStream';
import { LoungeApiError } from './loungeApi';
import { loungeSpeechPauseMs } from './lounge';
import { loadLoungeAvatar, safeLoungeAvatarUrl } from './loungeAvatar';

export type VoiceParticipant = { id: string; name: string; muted: boolean; avatarIndex?: number; avatarUrl?: string };
const readAvatarUrl = (metadata?: string) => { try { return safeLoungeAvatarUrl(JSON.parse(metadata || '{}').loungeAvatarUrl); } catch { return undefined; } };
const readAvatar = (metadata?: string) => {
  try {
    const value = JSON.parse(metadata || '{}').loungeAvatar;
    return Number.isInteger(value) && value >= 0 && value < 6 ? value as number : undefined;
  } catch { return undefined; }
};
export function useLoungeAudio(roomId: string, hostId: string, onUtterance: (audio: Blob, turnId?: string) => Promise<void>, capacity = 4, floor?: { allowed: boolean; speakerId: string | null; turnId?: string }) {
  const roomRef = useRef<Room | null>(null);
  const microphone = useRef<LocalAudioTrack | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const releaseMicAnalysis = useRef<(() => void) | null>(null);
  const outputContext = useRef<AudioContext | null>(null);
  const speechActivity = useRef({ lastVoiceAt: 0, recording: false, voicedMs: 0 });
  const floorRef = useRef(floor);
  const remoteMicrophones = useRef(new Map<HTMLMediaElement, string>());
  const recorder = useRef<MediaRecorder | null>(null);
  const frame = useRef(0);
  const elements = useRef(new Set<HTMLMediaElement>());
  const callback = useRef(onUtterance);
  const hostIdRef = useRef(hostId);
  const aiSpeakingRef = useRef(false);
  const pending = useRef(false);
  const version = useRef(0);
  const playback = useRef<{ finish: () => void } | null>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [hostText, setHostText] = useState('');
  const [participants, setParticipants] = useState<VoiceParticipant[]>([]);
  const [speakers, setSpeakers] = useState<string[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { callback.current = onUtterance; hostIdRef.current = hostId; }, [onUtterance, hostId]);
  const floorAllowed = floor?.allowed, floorSpeaker = floor?.speakerId, floorTurn = floor?.turnId;
  useEffect(() => {
    floorRef.current = floorAllowed === undefined ? undefined : { allowed: floorAllowed, speakerId: floorSpeaker ?? null, turnId: floorTurn };
    const track = microphone.current;
    if (track) void (floorAllowed === false ? track.mute() : track.unmute());
    for (const [element, owner] of remoteMicrophones.current) element.muted = floorAllowed !== undefined && owner !== floorSpeaker;
  }, [floorAllowed, floorSpeaker, floorTurn]);

  const stopHost = useCallback(() => { playback.current?.finish(); }, []);
  const stopMicrophone = useCallback(() => {
    cancelAnimationFrame(frame.current);
    if (recorder.current?.state === 'recording') recorder.current.stop();
    recorder.current = null;
    releaseMicAnalysis.current?.(); releaseMicAnalysis.current = null;
    speechActivity.current.recording = false;
    const track = microphone.current; microphone.current = null;
    if (track) { void roomRef.current?.localParticipant.unpublishTrack(track); track.stop(); }
    if (audioContext.current !== outputContext.current) void audioContext.current?.close(); audioContext.current = null;
    setMicOn(false);
  }, []);

  const disconnect = useCallback(() => {
    version.current += 1;
    stopHost(); stopMicrophone();
    const current = roomRef.current; roomRef.current = null;
    void current?.disconnect();
    void outputContext.current?.close(); outputContext.current = null;
    elements.current.forEach(element => element.remove()); elements.current.clear();
    remoteMicrophones.current.clear();
    aiSpeakingRef.current = false;
    setConnected(false); setAudioReady(false); setAiSpeaking(false); setHostText(''); setParticipants([]); setSpeakers([]);
  }, [stopHost, stopMicrophone]);

  const enableAudio = useCallback(() => {
    const context = outputContext.current;
    if (!context) return;
    // Run resume synchronously when this is invoked by a permission fallback button.
    void context.resume().then(() => { if (outputContext.current === context) setAudioReady(context.state === 'running'); }).catch(() => { if (outputContext.current === context) setAudioReady(false); });
    const room = roomRef.current;
    void room?.startAudio().catch(() => { if (roomRef.current === room) setAudioReady(false); });
  }, []);

  const connect = useCallback(async () => {
    if (pending.current || roomRef.current) return;
    pending.current = true; const generation = version.current;
    setConnecting(true); setError('');
    try {
      const { data } = await supabase.auth.getSession();
      const response = await fetch('/api/livekit-token', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` }, body: JSON.stringify({ roomName: roomId }) });
      const credentials = await response.json();
      if (!response.ok) throw new Error(credentials.error || '음성 연결에 실패했어요.');
      if (generation !== version.current) return;
      const room = new Room({ adaptiveStream: true }); roomRef.current = room;
      // Match TTS PCM to avoid independently resampling every network packet.
      let context: AudioContext;
      try { context = new AudioContext({ sampleRate: 24_000 }); } catch { context = new AudioContext(); }
      outputContext.current = context;
      context.onstatechange = () => { if (outputContext.current === context) setAudioReady(context.state === 'running'); };
      const sync = () => setParticipants([room.localParticipant, ...room.remoteParticipants.values()].map(participant => ({ id: participant.identity, name: participant.name || '친구', muted: !participant.isMicrophoneEnabled, avatarIndex: readAvatar(participant.metadata), avatarUrl: readAvatarUrl(participant.metadata) })));
      room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        if (track.kind !== Track.Kind.Audio) return;
        const element = track.attach(); elements.current.add(element);
        if (publication.source === Track.Source.Microphone) { remoteMicrophones.current.set(element, participant.identity); element.muted = Boolean(floorRef.current && floorRef.current.speakerId !== participant.identity); }
        document.body.appendChild(element);
      });
      room.on(RoomEvent.TrackUnsubscribed, track => track.detach().forEach(element => { elements.current.delete(element); remoteMicrophones.current.delete(element); element.remove(); }));
      room.on(RoomEvent.ParticipantConnected, sync); room.on(RoomEvent.ParticipantDisconnected, sync);
      room.on(RoomEvent.ParticipantMetadataChanged, sync);
      room.on(RoomEvent.ParticipantDisconnected, participant => { if (participant.identity === hostIdRef.current) { aiSpeakingRef.current = false; setAiSpeaking(false); } });
      room.on(RoomEvent.TrackMuted, sync); room.on(RoomEvent.TrackUnmuted, sync);
      room.on(RoomEvent.LocalTrackPublished, sync); room.on(RoomEvent.LocalTrackUnpublished, sync);
      room.on(RoomEvent.AudioPlaybackStatusChanged, permitted => { if (roomRef.current === room) setAudioReady(Boolean(permitted) && context.state === 'running'); });
      room.on(RoomEvent.ActiveSpeakersChanged, active => setSpeakers(active.map(participant => participant.identity)));
      room.on(RoomEvent.DataReceived, (payload, participant) => {
        if (participant?.identity !== hostIdRef.current) return;
        try { const data = JSON.parse(new TextDecoder().decode(payload)); if (data.type === 'lounge-ai') { aiSpeakingRef.current = Boolean(data.speaking); setAiSpeaking(Boolean(data.speaking)); if (typeof data.text === 'string') setHostText(data.text.slice(0, 600)); } } catch { /* Ignore other room packets. */ }
      });
      room.on(RoomEvent.Reconnecting, () => { stopHost(); stopMicrophone(); setConnected(false); });
      room.on(RoomEvent.Reconnected, () => { setConnected(true); sync(); });
      room.on(RoomEvent.Disconnected, () => { if (roomRef.current === room) disconnect(); });
      await room.connect(credentials.url, credentials.token);
      if (generation !== version.current) { await room.disconnect(); return; }
      try {
        const { data: profile } = await supabase.from('users').select('lounge_avatar_path').eq('id', room.localParticipant.identity).single();
        const { loungeAvatarUrl } = await loadLoungeAvatar(profile?.lounge_avatar_path);
        const saved = localStorage.getItem(`lounge-avatar:${room.localParticipant.identity}`);
        const avatar = saved === null ? undefined : readAvatar(JSON.stringify({ loungeAvatar: Number(saved) }));
        if (loungeAvatarUrl || avatar !== undefined) await room.localParticipant.setMetadata(JSON.stringify({ ...JSON.parse(room.localParticipant.metadata || '{}'), loungeAvatar: avatar, loungeAvatarUrl }));
      } catch { /* Avatar preferences must never prevent voice connection. */ }
      setConnected(true); sync(); enableAudio();
    } catch (err) { disconnect(); setError(err instanceof Error ? err.message : '음성 연결에 실패했어요.'); }
    finally { pending.current = false; setConnecting(false); }
  }, [roomId, disconnect, stopHost, stopMicrophone, enableAudio]);

  const startMicrophone = useCallback(async () => {
    if (microphone.current || !roomRef.current || !connected || pending.current) return;
    pending.current = true;
    const room = roomRef.current;
    try {
      const track = await createLocalAudioTrack({ echoCancellation: true, noiseSuppression: true, autoGainControl: true });
      if (room !== roomRef.current) { track.stop(); return; }
      microphone.current = track;
      if (floorRef.current?.allowed === false) await track.mute();
      await room.localParticipant.publishTrack(track, { source: Track.Source.Microphone });
      if (roomRef.current !== room || microphone.current !== track) { void room.localParticipant.unpublishTrack(track); track.stop(); return; }
      const context = outputContext.current;
      if (!context) throw new Error('음성 연결을 다시 확인해 주세요.');
      audioContext.current = context; enableAudio();
      const stream = new MediaStream([track.mediaStreamTrack]);
      const input = context.createMediaStreamSource(stream); const analyser = context.createAnalyser(); analyser.fftSize = 1024; input.connect(analyser);
      releaseMicAnalysis.current = () => { input.disconnect(); analyser.disconnect(); };
      const values = new Float32Array(analyser.fftSize);
      let started = 0, lastVoice = 0, lastFrame = performance.now();
      let utterance: { voicedFrames: number } | null = null;
      let queued = 0;
      const format = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported(type));
      if (!format) throw new Error('이 브라우저는 자동 음성 전사를 지원하지 않아요. Chrome 또는 Safari에서 접속해 주세요.');
      const begin = (now: number) => {
        const turnId = floorRef.current?.turnId;
        const chunks: Blob[] = [];
        const next = new MediaRecorder(stream, { mimeType: format }); recorder.current = next;
        const speech = { voicedFrames: 0 }; utterance = speech; started = now;
        next.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
        next.onstop = () => {
          const blob = new Blob(chunks, { type: next.mimeType });
          if (microphone.current !== track || speech.voicedFrames < 12 || blob.size < 300 || queued >= 3) return;
          queued += 1;
          void callback.current(blob, turnId).catch(err => setError(err instanceof Error ? err.message : '음성 전사가 잠시 지연돼요.')).finally(() => { queued -= 1; });
        };
        next.start();
      };
      const tick = () => {
        if (microphone.current !== track) return;
        const now = performance.now(); analyser.getFloatTimeDomainData(values);
        const rms = Math.sqrt(values.reduce((sum, sample) => sum + sample * sample, 0) / values.length);
        if (rms > 0.018 && !aiSpeakingRef.current && floorRef.current?.allowed !== false) {
          speechActivity.current.voicedMs += Math.min(100, now - lastFrame);
          lastVoice = now;
          speechActivity.current.lastVoiceAt = Date.now();
          if (!recorder.current) begin(now);
          if (utterance) utterance.voicedFrames += 1;
        }
        lastFrame = now;
        if (recorder.current && (now - lastVoice > loungeSpeechPauseMs(capacity) || now - started > 20_000 || aiSpeakingRef.current || floorRef.current?.allowed === false)) {
          recorder.current.stop(); recorder.current = null;
        }
        speechActivity.current.recording = Boolean(recorder.current);
        frame.current = requestAnimationFrame(tick);
      };
      setMicOn(true); setError(''); tick();
    } catch (err) { stopMicrophone(); setError(err instanceof Error && err.name === 'NotAllowedError' ? '마이크 권한이 꺼져 있어요. 브라우저에서 허용하거나 글로 이야기해 주세요.' : err instanceof Error ? err.message : '마이크 권한을 확인해 주세요.'); }
    finally { pending.current = false; }
  }, [connected, stopMicrophone, enableAudio, capacity]);

  const playHost = useCallback(async (base64: string) => {
    const room = roomRef.current; if (!room) return;
    stopHost();
    const context = outputContext.current;
    if (!context || context.state !== 'running') throw new Error('소리 켜기를 눌러 사회자 음성을 들어 주세요.');
    try {
      await context.resume();
      const binary = atob(base64); const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
      const buffer = await context.decodeAudioData(bytes.buffer);
      if (roomRef.current !== room) return;
      const destination = context.createMediaStreamDestination();
      const source = context.createBufferSource(); source.buffer = buffer;
      source.connect(context.destination); source.connect(destination);
      const track = new LocalAudioTrack(destination.stream.getAudioTracks()[0]);
      await room.localParticipant.publishTrack(track, { name: 'ai-host', source: Track.Source.Unknown });
      if (roomRef.current !== room) { track.stop(); return; }
      await new Promise<void>(resolve => {
        let finished = false;
        const announce = (speaking: boolean) => { void room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify({ type: 'lounge-ai', speaking })), { reliable: true }).catch(() => {}); };
        const finish = () => {
          if (finished) return; finished = true;
          source.onended = null; try { source.stop(); } catch { /* May already be stopped. */ }
          announce(false); aiSpeakingRef.current = false; setAiSpeaking(false);
          void room.localParticipant.unpublishTrack(track); track.stop(); playback.current = null; resolve();
        };
        playback.current = { finish };
        source.onended = finish; aiSpeakingRef.current = true; setAiSpeaking(true); announce(true); source.start();
      });
    } catch (err) { setError(err instanceof Error ? err.message : '사회자 음성을 재생하지 못했어요.'); }
  }, [stopHost]);

  const playHostStream = useCallback(async (stream: ReadableStream<Uint8Array>, onFirstAudio: () => void, onTimings: (timings: Record<string, number>) => void, canStart: () => boolean) => {
    const room = roomRef.current;
    if (!room) { await stream.cancel(); return; }
    stopHost();
    const context = outputContext.current;
    if (!context || context.state !== 'running') { await stream.cancel(); throw new Error('소리 켜기를 눌러 사회자 음성을 들어 주세요.'); }
    const destination = context.createMediaStreamDestination();
    const track = new LocalAudioTrack(destination.stream.getAudioTracks()[0]);
    const queue = new PcmAudioQueue(context, [context.destination, destination]);
    const pcm = new Pcm16Decoder();
    const cancelRead = new AbortController();
    let stopped = false, first = true;
    let currentText = '';
    const announce = (speaking: boolean) => { void room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify({ type: 'lounge-ai', speaking, ...(speaking && currentText ? { text: currentText } : {}) })), { reliable: true }).catch(() => {}); };
    const finish = () => {
      if (stopped) return; stopped = true;
      cancelRead.abort();
      queue.stop(); announce(false); aiSpeakingRef.current = false; setAiSpeaking(false);
      void room.localParticipant.unpublishTrack(track).catch(() => {}); track.stop();
      // The reader owns a lock while consuming; cancelling the stream aborts fetch via the caller.
      if (!stream.locked) void stream.cancel().catch(() => {});
      if (playback.current?.finish === finish) playback.current = null;
    };
    playback.current = { finish };
    try {
      await context.resume();
      await room.localParticipant.publishTrack(track, { name: 'ai-host', source: Track.Source.Unknown });
      if (stopped || roomRef.current !== room) return;
      for await (const event of readLoungeStream(stream, cancelRead.signal)) {
        if (stopped || roomRef.current !== room) break;
        if (event.type === 'host') { currentText = event.text.slice(0, 600); setHostText(currentText); onTimings(event.timings); }
        if (event.type === 'audio') {
          if (first && !canStart()) return;
          const binary = atob(event.audio);
          const samples = pcm.decode(Uint8Array.from(binary, character => character.charCodeAt(0)));
          if (queue.push(samples) && first) {
            first = false; aiSpeakingRef.current = true; setAiSpeaking(true); announce(true); onFirstAudio();
          }
        }
      }
      if (!stopped) {
        pcm.finish();
        if (first && !canStart()) return;
        if (queue.finish() && first) {
          first = false; aiSpeakingRef.current = true; setAiSpeaking(true); announce(true); onFirstAudio();
        }
        if (first) throw new LoungeApiError('사회자 음성이 비어 있어요. 글로 대화를 이어갈게요.', 'lounge_invalid_audio');
        await queue.drain();
      }
    } catch (err) { if (!stopped) throw err; }
    finally { finish(); }
  }, [stopHost]);

  useEffect(() => () => { disconnect(); }, [disconnect, roomId]);
  const getSpeechActivity = useCallback(() => speechActivity.current, []);
  const chooseAvatar = useCallback(async (index: number) => {
    const room = roomRef.current;
    if (!room || !Number.isInteger(index) || index < 0 || index >= 6) return;
    const metadata = (() => { try { return JSON.parse(room.localParticipant.metadata || '{}'); } catch { return {}; } })();
    await room.localParticipant.setMetadata(JSON.stringify({ ...metadata, loungeAvatar: index, loungeAvatarUrl: undefined }));
    try { localStorage.setItem(`lounge-avatar:${room.localParticipant.identity}`, String(index)); } catch { /* Session selection still works without storage. */ }
  }, []);

  // AI audio is published by the human room owner's participant. It must not
  // light up that person's seat as if they were speaking into their microphone.
  const humanSpeakers = aiSpeaking ? speakers.filter(id => id !== hostId) : speakers;
  return { connected, connecting, micOn, audioReady, aiSpeaking, hostText, participants, speakers: humanSpeakers, error, connect, enableAudio, disconnect, startMicrophone, stopMicrophone, playHost, playHostStream, stopHost, getSpeechActivity, chooseAvatar };
}
